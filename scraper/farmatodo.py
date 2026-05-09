"""
Scraper de Farmatodo.

Lectura de CSV tolerante a UTF-8 / UTF-8-BOM / CP1252 / Latin-1.
"""

import csv
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


PROJECT_ROOT = Path(__file__).parent.parent
CSV_PATH = PROJECT_ROOT / "productos_competencia.csv"
RESULTS_PATH = PROJECT_ROOT / "resultados.json"
DEBUG_DIR = PROJECT_ROOT / "debug"


def read_text_robust(path: Path) -> str:
    raw = path.read_bytes()
    for encoding in ("utf-8", "utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise RuntimeError(f"No pude decodificar {path.name}")


def parse_price(text: str) -> float | None:
    """
    Bs.262.18    -> 262.18
    Bs.1.694.47  -> 1694.47
    Regla: el ULTIMO punto es decimal, los demás son separadores de miles.
    """
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", text.replace("Bs.", "").replace("Bs", ""))
    if not cleaned:
        return None
    if cleaned.count(".") > 1:
        parts = cleaned.split(".")
        cleaned = f"{''.join(parts[:-1])}.{parts[-1]}"
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
        "tiene_descuento": False,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
    }

    try:
        print(f"   Cargando...", flush=True)
        page.goto(url, wait_until="domcontentloaded", timeout=30000)

        print(f"   Esperando que cargue contenido...", flush=True)
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except PlaywrightTimeout:
            pass
        time.sleep(2)

        print(f"   Extrayendo datos...", flush=True)
        data = page.evaluate("""
            () => {
                const active = document.querySelector('span.product-purchase__price--active');
                const original = document.querySelector('del.product-purchase__price--original');
                const h1 = document.querySelector('h1');
                return {
                    active_text: active ? (active.innerText || active.textContent || '').trim() : null,
                    original_text: original ? (original.innerText || original.textContent || '').trim() : null,
                    nombre: h1 ? (h1.innerText || h1.textContent || '').trim() : null,
                };
            }
        """)

        result["nombre"] = data.get("nombre")
        precio_activo = parse_price(data.get("active_text"))
        precio_original = parse_price(data.get("original_text"))

        if precio_original is not None and precio_activo is not None:
            result["precio_full_bs"] = precio_original
            result["precio_desc_bs"] = precio_activo
            result["tiene_descuento"] = True
        elif precio_activo is not None:
            result["precio_full_bs"] = precio_activo
            result["tiene_descuento"] = False
        else:
            result["error"] = "No se encontraron los selectores de precio"
            DEBUG_DIR.mkdir(exist_ok=True)
            try:
                shot = DEBUG_DIR / f"sin_precio_{marca.replace(' ', '_')}.png"
                page.screenshot(path=str(shot), full_page=True)
                print(f"   Screenshot guardado: {shot}")
            except Exception:
                pass

    except PlaywrightTimeout as e:
        result["error"] = f"Timeout: {e}"
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"

    return result


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: no encuentro {CSV_PATH}")
        sys.exit(1)

    text = read_text_robust(CSV_PATH)
    sample = text[:2048]
    delim = ";" if sample.count(";") > sample.count(",") else ","

    filas = []
    for row in csv.DictReader(io.StringIO(text), delimiter=delim):
        if (
            row.get("cadena", "").strip().lower() == "farmatodo"
            and row.get("activo", "").strip().lower() == "si"
        ):
            filas.append(row)

    if not filas:
        print("No hay filas de Farmatodo activas en el CSV.")
        sys.exit(0)

    print(f"Scrapeando {len(filas)} URLs de Farmatodo...\n")
    inicio = time.time()
    resultados = []

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

        for i, fila in enumerate(filas, 1):
            print(f"[{i}/{len(filas)}] {fila['marca']} ({fila['tipo']})", flush=True)
            r = scrape_url(page, fila["url"], fila["marca"])
            r["id_producto_propio"] = fila["id_producto_propio"]
            r["cadena"] = fila["cadena"]
            r["tipo"] = fila["tipo"]
            resultados.append(r)

            if r["error"]:
                print(f"   ERROR: {r['error']}\n")
            else:
                print(f"   Nombre: {r['nombre']}")
                if r["tiene_descuento"]:
                    pct = (1 - r["precio_desc_bs"] / r["precio_full_bs"]) * 100
                    print(f"   Precio normal:    Bs {r['precio_full_bs']:,.2f}")
                    print(f"   Precio descuento: Bs {r['precio_desc_bs']:,.2f}  (-{pct:.0f}%)")
                else:
                    print(f"   Precio: Bs {r['precio_full_bs']:,.2f}  (sin descuento)")
                print()

        browser.close()

    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(resultados, f, ensure_ascii=False, indent=2, default=str)

    duracion = time.time() - inicio
    ok = sum(1 for r in resultados if not r["error"])
    print(f"Total: {duracion:.1f}s | {ok}/{len(resultados)} OK")
    print(f"Resultados guardados en: {RESULTS_PATH}")


if __name__ == "__main__":
    main()
