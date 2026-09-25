"""Generic Ecommerce Catalog Crawler.

Dynamically discovers and imports complete product catalogs from any ecommerce website.
Supports Shopify, WooCommerce, and generic HTML-based stores.
No hard-coded categories — discovers the site's own structure automatically.
"""
import asyncio
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Dict, Set
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from qrcard import data_dir

DATA_DIR = data_dir()
IMAGES_DIR = DATA_DIR / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


async def crawl_store(url: str, brand: str = None, progress_cb=None) -> Dict:
    crawler = EcommerceCrawler(url, brand, progress_cb)
    products = await crawler.crawl()
    return {
        "total": len(products),
        "products": products,
        "categories": crawler.categories_found,
    }


class EcommerceCrawler:

    def __init__(self, base_url: str, brand: str = None, progress_cb=None):
        self.raw_url = base_url.strip()
        parsed = urlparse(self.raw_url if "://" in self.raw_url else "https://" + self.raw_url)
        self.scheme = parsed.scheme or "https"
        self.domain = parsed.netloc
        self.base = f"{self.scheme}://{self.domain}"
        self.brand = brand or self.domain.split(".")[0].replace("www.", "").title()
        self.progress_cb = progress_cb
        self.visited: Set[str] = set()
        self.product_urls: Set[str] = set()
        self.products: List[Dict] = []
        self.categories_found: List[str] = []

    async def _msg(self, m: str):
        if self.progress_cb:
            try:
                await self.progress_cb(m)
            except Exception:
                pass

    async def crawl(self) -> List[Dict]:
        async with httpx.AsyncClient(
            headers=HEADERS,
            follow_redirects=True,
            timeout=httpx.Timeout(25.0, read=30.0),
            limits=httpx.Limits(max_connections=8, max_keepalive_connections=4),
        ) as client:
            platform = await self._detect_platform(client)
            await self._msg(f"Detected platform: {platform}")

            if platform == "shopify":
                await self._crawl_shopify(client)
            elif platform == "woocommerce":
                await self._crawl_woocommerce(client)
            else:
                await self._crawl_generic(client)

            await self._download_images(client)

        await self._msg(f"Done — {len(self.products)} products imported")
        return self.products

    async def _detect_platform(self, c: httpx.AsyncClient) -> str:
        try:
            r = await c.get(f"{self.base}/products.json?limit=1")
            if r.status_code == 200:
                body = r.json()
                if "products" in body:
                    return "shopify"
        except Exception:
            pass

        try:
            r = await c.get(f"{self.base}/wp-json/wc/store/v1/products?per_page=1")
            if r.status_code == 200:
                return "woocommerce"
        except Exception:
            pass

        try:
            r = await c.get(self.base)
            if "woocommerce" in r.text.lower():
                return "woocommerce"
        except Exception:
            pass

        return "generic"

    async def _crawl_shopify(self, c: httpx.AsyncClient):
        await self._msg("Crawling Shopify /products.json …")
        page = 1
        while True:
            try:
                r = await c.get(f"{self.base}/products.json?limit=250&page={page}")
                if r.status_code != 200:
                    break
                items = r.json().get("products", [])
                if not items:
                    break
                for p in items:
                    self._add_shopify_product(p)
                await self._msg(f"  page {page}: {len(items)} products")
                page += 1
                if len(items) < 250:
                    break
                await asyncio.sleep(0.3)
            except Exception:
                break

        await self._msg("Crawling collections …")
        try:
            r = await c.get(f"{self.base}/collections.json?limit=250")
            if r.status_code == 200:
                cols = r.json().get("collections", [])
                for col in cols:
                    title = col.get("title", "")
                    handle = col.get("handle", "")
                    if title and title not in self.categories_found:
                        self.categories_found.append(title)
                        await self._crawl_shopify_collection(c, handle, title)
        except Exception:
            pass

        if not self.product_urls:
            await self._discover_from_homepage(c)

    async def _crawl_shopify_collection(self, c, handle: str, title: str):
        if not handle:
            return
        page = 1
        while True:
            try:
                r = await c.get(
                    f"{self.base}/collections/{handle}/products.json?limit=250&page={page}"
                )
                if r.status_code != 200:
                    break
                items = r.json().get("products", [])
                if not items:
                    break
                for p in items:
                    self._add_shopify_product(p, collection=title)
                page += 1
                if len(items) < 250:
                    break
                await asyncio.sleep(0.3)
            except Exception:
                break

    def _add_shopify_product(self, p: dict, collection: str = ""):
        handle = p.get("handle", "")
        url = f"{self.base}/products/{handle}"
        if url in self.visited:
            return
        self.visited.add(url)
        self.product_urls.add(url)

        variants = p.get("variants", [])
        images = [img.get("src") for img in p.get("images", []) if img.get("src")]

        skus = []
        colors = []
        sizes = []
        for v in variants:
            s = (v.get("sku") or "").strip()
            if s:
                skus.append(s.upper())
            opt1 = (v.get("option1") or "").strip()
            opt2 = (v.get("option2") or "").strip()
            if opt1:
                colors.append(opt1)
            if opt2:
                sizes.append(opt2)
        colors = list(dict.fromkeys(colors))
        sizes = list(dict.fromkeys(sizes))

        price = ""
        compare = ""
        if variants:
            price = str(variants[0].get("price", ""))
            compare = str(variants[0].get("compare_at_price") or "")

        prod_type = (p.get("product_type") or "").strip()
        tags = p.get("tags") or []
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        cat = collection or prod_type or ""
        if cat and cat not in self.categories_found:
            self.categories_found.append(cat)

        self.products.append({
            "name": p.get("title", ""),
            "url": url,
            "sku": skus[0] if skus else "",
            "variant_skus": skus,
            "price": price,
            "compare_at_price": compare,
            "currency": "",
            "category": cat,
            "subcategory": "",
            "product_type": prod_type,
            "description": p.get("body_html", ""),
            "images": images,
            "local_images": [],
            "colors": colors,
            "sizes": sizes,
            "availability": "",
            "brand": self.brand,
            "metadata": {
                "vendor": p.get("vendor", ""),
                "tags": tags,
                "handle": handle,
                "created_at": p.get("created_at", ""),
                "updated_at": p.get("updated_at", ""),
                "published_at": p.get("published_at", ""),
            },
        })

    async def _crawl_woocommerce(self, c: httpx.AsyncClient):
        page = 1
        found = False
        while True:
            await self._msg(f"WooCommerce API page {page} …")
            try:
                r = await c.get(
                    f"{self.base}/wp-json/wc/store/v1/products",
                    params={"per_page": 100, "page": page},
                )
                if r.status_code != 200:
                    break
                items = r.json()
                if not items:
                    break
                found = True
                for item in items:
                    self._add_woocommerce_product(item)
                page += 1
                if len(items) < 100:
                    break
                await asyncio.sleep(0.3)
            except Exception:
                break

        if not found:
            await self._crawl_generic(c)

    def _add_woocommerce_product(self, item: dict):
        url = item.get("permalink", "")
        if not url or url in self.visited:
            return
        self.visited.add(url)

        images = [img.get("src") for img in item.get("images", []) if img.get("src")]
        skus = []
        colors = []
        sizes = []
        for attr in item.get("attributes", []):
            name = (attr.get("name") or "").lower()
            opts = [str(o) for o in (attr.get("options") or []) if o]
            if "color" in name or "colour" in name:
                colors = opts
            elif "size" in name:
                sizes = opts
        s = (item.get("sku") or "").strip()
        if s:
            skus.append(s.upper())

        self.products.append({
            "name": item.get("name", ""),
            "url": url,
            "sku": skus[0] if skus else "",
            "variant_skus": skus,
            "price": str(item.get("prices", {}).get("price", "")),
            "compare_at_price": str(item.get("prices", {}).get("regular_price", "")),
            "currency": "",
            "category": "",
            "subcategory": "",
            "product_type": "",
            "description": item.get("description", ""),
            "images": images,
            "local_images": [],
            "colors": colors,
            "sizes": sizes,
            "availability": "in_stock" if item.get("is_in_stock") else "out_of_stock",
            "brand": self.brand,
            "metadata": {
                "short_description": item.get("short_description", ""),
                "sku": item.get("sku", ""),
            },
        })

    async def _crawl_generic(self, c: httpx.AsyncClient):
        await self._msg("Checking sitemap …")
        sitemap_urls = await self._parse_sitemap(c)
        self.product_urls.update(sitemap_urls)

        await self._msg("Discovering product links …")
        await self._discover_from_homepage(c)

        await self._msg("Crawling listing pages …")
        await self._crawl_listing_pages(c)

        total = len(self.product_urls)
        await self._msg(f"Scraping {total} product pages …")
        idx = 0
        for url in list(self.product_urls):
            idx += 1
            if idx % 10 == 0:
                await self._msg(f"  product {idx}/{total} …")
            await self._scrape_product_page(c, url)
            await asyncio.sleep(0.4)

    async def _parse_sitemap(self, c: httpx.AsyncClient) -> Set[str]:
        urls: Set[str] = set()
        for path in ("/sitemap.xml", "/sitemap_index.xml"):
            try:
                r = await c.get(f"{self.base}{path}")
                if r.status_code != 200:
                    continue
                root = ET.fromstring(r.text)
                ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                for loc in root.findall(".//sm:url/sm:loc", ns):
                    u = (loc.text or "").strip()
                    if self._looks_like_product(u):
                        urls.add(u)
                for loc in root.findall(".//sm:sitemap/sm:loc", ns):
                    sub = (loc.text or "").strip()
                    try:
                        r2 = await c.get(sub)
                        if r2.status_code == 200:
                            root2 = ET.fromstring(r2.text)
                            for loc2 in root2.findall(".//sm:url/sm:loc", ns):
                                u = (loc2.text or "").strip()
                                if self._looks_like_product(u):
                                    urls.add(u)
                    except Exception:
                        pass
                if urls:
                    break
            except Exception:
                pass
        return urls

    @staticmethod
    def _looks_like_product(url: str) -> bool:
        low = url.lower()
        return any(kw in low for kw in ("/product", "/products/", "/item/", "/p/"))

    async def _discover_from_homepage(self, c: httpx.AsyncClient):
        try:
            r = await c.get(self.base)
            if r.status_code != 200:
                return
            soup = BeautifulSoup(r.text, "html.parser")
            self._extract_product_links(soup, self.base)
            listing_links = set()
            for a in soup.find_all("a", href=True):
                href = a["href"]
                full = urljoin(self.base, href)
                if self.domain not in full:
                    continue
                low = full.lower()
                if any(kw in low for kw in ("/collection", "/category", "/shop", "/catalog", "/c/")):
                    listing_links.add(full)
            self._listing_pages.update(listing_links)
        except Exception:
            pass

    _listing_pages: Set[str] = set()

    async def _crawl_listing_pages(self, c: httpx.AsyncClient):
        visited_listing: Set[str] = set()
        max_pages = 50
        count = 0

        for p in ("/collections", "/shop", "/categories", "/catalog", "/products"):
            self._listing_pages.add(f"{self.base}{p}")

        while self._listing_pages and count < max_pages:
            url = self._listing_pages.pop()
            if url in visited_listing:
                continue
            visited_listing.add(url)
            count += 1
            try:
                r = await c.get(url)
                if r.status_code != 200:
                    continue
                soup = BeautifulSoup(r.text, "html.parser")
                old_count = len(self.product_urls)
                self._extract_product_links(soup, url)
                new_count = len(self.product_urls)
                if new_count == old_count:
                    for a in soup.find_all("a", href=True):
                        href = a["href"]
                        full = urljoin(url, href)
                        if self.domain in full and full not in visited_listing:
                            low = full.lower()
                            if any(p in low for p in ("page=", "?page=", "/page/", "&p=")):
                                self._listing_pages.add(full)
                await asyncio.sleep(0.3)
            except Exception:
                pass

    def _extract_product_links(self, soup: BeautifulSoup, page_url: str):
        for a in soup.find_all("a", href=True):
            href = a["href"]
            full = urljoin(page_url, href)
            if self.domain not in full:
                continue
            if self._looks_like_product(full) and full not in self.visited:
                clean = full.split("?")[0].split("#")[0]
                self.product_urls.add(clean)

    async def _scrape_product_page(self, c: httpx.AsyncClient, url: str):
        if url in self.visited:
            return
        self.visited.add(url)

        try:
            r = await c.get(url)
            if r.status_code != 200:
                return
            html = r.text
            soup = BeautifulSoup(html, "html.parser")

            name, sku, desc, images, price, compare_price, colors, sizes = (
                "", "", "", [], "", "", [], []
            )
            for script in soup.find_all("script", type="application/ld+json"):
                try:
                    data = json.loads(script.string or "")
                    if isinstance(data, list):
                        data = data[0] if data else {}
                    if data.get("@type") == "Product":
                        name = data.get("name", "")
                        sku = (data.get("sku") or "").strip()
                        desc = data.get("description", "")
                        img = data.get("image")
                        if isinstance(img, str):
                            images = [img]
                        elif isinstance(img, list):
                            images = img
                        offers = data.get("offers", {})
                        if isinstance(offers, list):
                            offers = offers[0] if offers else {}
                        price = str(offers.get("price", ""))
                        break
                except Exception:
                    pass

            shopify_match = re.search(r'var\s+meta\s*=\s*(\{.*?\});', html, re.S)
            if not shopify_match:
                shopify_match = re.search(r'"product"\s*:\s*(\{.*?\})\s*[,}]', html, re.S)

            if not name:
                tag = soup.find("meta", property="og:title") or soup.find("meta", attrs={"name": "og:title"})
                if tag:
                    name = tag.get("content", "")
            if not name:
                t = soup.find("title")
                if t:
                    name = t.text.strip().split("|")[0].split("–")[0].split("-")[0].strip()
            if not images:
                tag = (
                    soup.find("meta", property="og:image:url")
                    or soup.find("meta", property="og:image:secure_url")
                    or soup.find("meta", property="og:image")
                    or soup.find("meta", attrs={"name": "og:image"})
                )
                if tag:
                    images = [tag.get("content", "")]
            if not images:
                for img in soup.find_all("img"):
                    srcset = img.get("srcset", "")
                    src = img.get("src", "")
                    if src and "cdn.shopify.com" in src and "assets" not in src:
                        best = self._best_from_srcset(srcset, src)
                        if best:
                            images.append(best)
                            break
            if not images:
                cdn_imgs = re.findall(
                    r'(https://cdn\.shopify\.com/s/files/[^"\x27>\s]+\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                product_imgs = [u for u in cdn_imgs if "assets" not in u.lower() and "logo" not in u.lower()]
                if product_imgs:
                    images = list(dict.fromkeys(product_imgs))[:6]
            if not images:
                dw_imgs = re.findall(
                    r'(https://[^"\x27>\s]+/dw/image/v2/[^"\x27>\s]+\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs += re.findall(
                    r'(https://[^"\x27>\s]+/on/demandware\.static/[^"\x27>\s]+\.(?:jpg|jpeg|png|webp))',
                    html,
                )
                dw_imgs += re.findall(
                    r'data-high-src="([^"]+\.(?:jpg|jpeg|png|webp))"',
                    html,
                )
                dw_imgs += re.findall(
                    r'data-src="([^"]+\.(?:jpg|jpeg|png|webp))"',
                    html,
                )
                product_dw = [
                    u for u in dw_imgs
                    if "logo" not in u.lower() and "icon" not in u.lower() and "swatch" not in u.lower() and "assets" not in u.lower()
                ]
                if product_dw:
                    images = list(dict.fromkeys(product_dw))[:6]

            if not sku:
                sku = self._detect_sku_from_html(html)

            if not price:
                price = self._detect_price_from_html(html)

            colors = self._detect_colors_from_html(html, colors)
            sizes = self._detect_sizes_from_html(html, sizes)
            cat = self._detect_category_from_html(soup)

            images = [self._clean_image_url(img, url) for img in images if img]
            images = list(dict.fromkeys(images))[:10]

            self.products.append({
                "name": name or url.rstrip("/").split("/")[-1].replace("-", " ").replace("_", " ").title(),
                "url": url,
                "sku": sku,
                "variant_skus": [sku] if sku else [],
                "price": price,
                "compare_at_price": compare_price,
                "currency": "",
                "category": cat,
                "subcategory": "",
                "product_type": "",
                "description": desc[:2000] if desc else "",
                "images": images,
                "local_images": [],
                "colors": colors,
                "sizes": sizes,
                "availability": "",
                "brand": self.brand,
                "metadata": {},
            })
        except Exception:
            pass

    def _detect_sku_from_html(self, html: str) -> str:
        patterns = [
            r'SKU:\s*(?:<[^>]+>)?\s*([A-Za-z0-9][\w\-]{2,40})',
            r'class="product-id"[^>]*>\s*([^<]+)\s*<',
            r'"sku"\s*:\s*"([^"]{3,})"',
            r'data-sku="([^"]{3,})"',
            r'Product\s*(?:Code|ID|Number|Reference)[:\s]*["\']?([A-Za-z0-9][\w\-]{2,40})["\']?',
            r'(?:item(?:_?no|number)|article(?:_?no)?)[:\s]*["\']?([A-Za-z0-9][\w\-]{2,40})["\']?',
            r'"product_code"\s*:\s*"([^"]{3,})"',
            r'data-pid="([^"]{3,})"',
            r'class="[^"]*product-id[^"]*"[^>]*>\s*([^\s<]{3,})',
            r'<meta[^>]+property="product:sku"[^>]+content="([^"]{3,})"',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.I)
            if m:
                val = m.group(1).strip()
                skip = {"context", "secondary", "auids", "variant", "product", "image", "function", "return"}
                low = val.lower()
                if len(val) >= 3 and not any(low.startswith(s) for s in skip):
                    return val.upper()
        return ""

    def _detect_price_from_html(self, html: str) -> str:
        patterns = [
            r'"price"\s*:\s*"?(\d+[\d.,]*)"?',
            r'class="[^"]*(?:price|amount)[^"]*"[^>]*>\s*(?:[A-Z]{3}\s*)?(\d[\d,]*\.?\d*)',
            r'content="(\d[\d.,]*)"',
        ]
        for pat in patterns:
            m = re.search(pat, html, re.I)
            if m:
                return m.group(1).replace(",", "")
        return ""

    def _detect_colors_from_html(self, html: str, existing: list) -> list:
        if existing:
            return existing
        colors = set()
        for m in re.finditer(r'(?:color|colour)["\s:]+([A-Za-z][\w\s]{1,30})', html, re.I):
            c = m.group(1).strip()
            if len(c) < 35:
                colors.add(c)
        return list(colors)[:20]

    def _detect_sizes_from_html(self, html: str, existing: list) -> list:
        if existing:
            return existing
        sizes = set()
        for m in re.finditer(r'(?:size)["\s:]+([A-Za-z0-9][\w\s]{0,15})', html, re.I):
            s = m.group(1).strip()
            if len(s) < 20:
                sizes.add(s)
        return list(sizes)[:20]

    def _detect_category_from_html(self, soup: BeautifulSoup) -> str:
        for nav in soup.find_all(["nav", "ol", "ul"], class_=lambda c: c and "breadcrumb" in str(c).lower()):
            links = nav.find_all("a")
            if len(links) >= 2:
                return links[-2].text.strip()
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
                if isinstance(data, list):
                    data = data[0] if data else {}
                if data.get("@type") == "BreadcrumbList":
                    items = data.get("itemListElement", [])
                    if len(items) >= 2:
                        return items[-2].get("item", {}).get("name", "")
            except Exception:
                pass
        return ""

    @staticmethod
    def _best_from_srcset(srcset: str, fallback: str) -> str:
        if not srcset:
            return fallback
        best_url, best_w = fallback, 0
        for part in srcset.split(","):
            part = part.strip()
            tokens = part.split()
            if len(tokens) >= 2:
                try:
                    w = int(tokens[1].rstrip("w"))
                    if w > best_w:
                        best_w = w
                        best_url = tokens[0]
                except ValueError:
                    pass
        return best_url

    @staticmethod
    def _clean_image_url(url: str, page_url: str) -> str:
        if not url:
            return ""
        full = urljoin(page_url, url)
        if "cdn.shopify.com" in full or "dw/image/v2" in full or "demandware" in full:
            return full.split("?")[0]
        full = re.sub(r'_(?:\d+x\d*|X\d+)(\.\w+)$', r'\1', full)
        return full.split("?")[0]

    async def _download_images(self, c: httpx.AsyncClient):
        total = len(self.products)
        for i, p in enumerate(self.products):
            imgs = p.get("images", [])
            if not imgs:
                continue
            local_paths = []
            for img_url in imgs[:4]:
                try:
                    ext = ".jpg"
                    low = img_url.lower()
                    if ".png" in low:
                        ext = ".png"
                    elif ".webp" in low:
                        ext = ".webp"
                    fname = hashlib.md5(img_url.encode()).hexdigest() + ext
                    fpath = IMAGES_DIR / fname
                    if not fpath.exists():
                        r = await c.get(img_url)
                        if r.status_code == 200 and len(r.content) > 500:
                            fpath.write_bytes(r.content)
                    if fpath.exists():
                        local_paths.append(str(fpath))
                except Exception:
                    pass
            p["local_images"] = local_paths
            if i % 20 == 0:
                await self._msg(f"  images {i+1}/{total} …")
