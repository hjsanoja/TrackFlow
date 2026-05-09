"""
Scraper de Farmatodo - versión 2.

Cambios respecto a la versión anterior:
- Usa 'domcontentloaded' en lugar de 'networkidle' (más rápido).
- Imprime cada paso para que veas el progreso.
- Toma screenshot cuando falla.
- Bloquea imágenes, fonts y video para acelerar.
"""

import csv
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


CSV_PATH = Path(__file__).parent.parent / "productos_competencia.csv"
SCREENSHOTS_DIR = Path(__file__).parent.parent / "debug_screenshots"


def parse_price(text: str) -> float | None:
    if not text:
        return None
    cleaned = re.sub(r"[^\d.,]", "", text)
    if not cleaned:
        return None
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")
    try:
        return float(cleaned)
    except ValueError:
        return None


def scrape_url(page, url: str, marca: str) -> dict:
    result = {
        "url": url,
        "marca": marca,
        "nombre": None,
        "precio_full_bs": None,
        "precio_desc_bs": None,
        "error": None,
    }

    try:
        print(f"   [1/4] Navegando a la URL...", flush=True)
        page.goto(url, wait_until="domcontentloaded", timeout=30000)

        print(f"   [2/4] Esperando que cargue el precio...", flush=True)
        try:
            page.wait_for_function(
                """() => {
                    const text = document.body.innerText || '';
                    return /Bs\\s*\\.?\\s*[\\d.,]+/.test(text);
                }""",
                timeout=15000,
            )
        except PlaywrightTimeout:
            result["error"] = "Precio no apareció en 15 segundos"
            return result

        time.sleep(1)

        print(f"   [3/4] Extrayendo nombre del producto...", flush=True)
        try:
            h1 = page.locator("h1").first
            if h1.count() > 0:
                result["nombre"] = h1.inner_text(timeout=2000).strip()
        except PlaywrightTimeout:
            pass

        print(f"   [4/4] Extrayendo precios...", flush=True)
        body_text = page.locator("body").inner_text(timeout=5000)

        precio_matches = re.findall(
            r"Bs\.?\s*[\d]{1,3}(?:\.\d{3})*(?:,\d{1,2})?", body_text
        )

        precios_encontrados = []
        for m in precio_matches:
            p = parse_price(m)
            if p and 0.01 <= p <= 100_000_000:
                precios_encontrados.append(p)

        if precios_encontrados:
            unicos = sorted(set(precios_encontrados))
            if len(unicos) == 1:
                result["precio_full_bs"] = unicos[0]
            else:
                result["precio_full_bs"] = unicos[-1]
                result["precio_desc_bs"] = unicos[0]
        else:
            result["error"] = "No se encontraron precios en el texto de la página"

    except PlaywrightTimeout as e:
        result["error"] = f"Timeout: {e}"
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"

    return result


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: no encuentro {CSV_PATH}")
        sys.exit(1)

    SCREENSHOTS_DIR.mkdir(exist_ok=True)

    filas = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            if (
                row.get("cadena", "").strip().lower() == "farmatodo"
                and row.get("activo", "").strip().lower() == "si"
            ):
                filas.append(row)

    if not filas:
        print("No hay filas de Farmatodo activas en el CSV.")
        sys.exit(0)

    print(f"Voy a scrapear {len(filas)} URLs de Farmatodo...\n")
    inicio_global = time.time()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="es-VE",
        )
        page = context.new_page()

        page.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in ("image", "media", "font")
            else route.continue_(),
        )

        for i, fila in enumerate(filas, 1):
            print(f"[{i}/{len(filas)}] -> {fila['marca']} ({fila['tipo']})", flush=True)
            inicio = time.time()
            r = scrape_url(page, fila["url"], fila["marca"])
            duracion = time.time() - inicio

            if r["error"]:
                print(f"   ERROR ({duracion:.1f}s): {r['error']}")
                screenshot_path = SCREENSHOTS_DIR / f"error_{fila['marca'].replace(' ', '_')}.png"
                try:
                    page.screenshot(path=str(screenshot_path), full_page=True)
                    print(f"   Screenshot guardado: {screenshot_path}")
                except Exception as e:
                    print(f"   No pude tomar screenshot: {e}")
            else:
                print(f"   OK ({duracion:.1f}s)")
                print(f"   Nombre: {r['nombre']}")
                if r["precio_desc_bs"]:
                    print(f"   Precio full:      Bs {r['precio_full_bs']:,.2f}")
                    print(f"   Precio descuento: Bs {r['precio_desc_bs']:,.2f}")
                else:
                    print(f"   Precio: Bs {r['precio_full_bs']:,.2f}")
            print()

        browser.close()

    print(f"Total: {time.time() - inicio_global:.1f}s")


if __name__ == "__main__":
    main()
