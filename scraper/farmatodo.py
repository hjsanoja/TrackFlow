"""
Scraper de Farmatodo - versión 3 (diagnóstico).

Esta versión NO intenta extraer "el" precio. En cambio:
1. Carga la página.
2. Lista los 30 elementos con texto que parezca contener un número.
3. Guarda el HTML completo de la página en debug_html/.
4. Toma screenshot.

Con eso podemos ver qué hay en realidad y escribir selectores correctos.
"""

import csv
import re
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


CSV_PATH = Path(__file__).parent.parent / "productos_competencia.csv"
DEBUG_DIR = Path(__file__).parent.parent / "debug"


def diagnostic_url(page, url: str, marca: str) -> None:
    print(f"   [1/3] Navegando...", flush=True)
    page.goto(url, wait_until="domcontentloaded", timeout=30000)

    print(f"   [2/3] Esperando contenido (5s)...", flush=True)
    # En lugar de esperar texto Bs específico, esperamos un poco fijo
    # y luego diagnosticamos lo que hay.
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except PlaywrightTimeout:
        pass
    time.sleep(2)

    print(f"   [3/3] Diagnóstico:", flush=True)

    # 1. Guardar HTML completo
    html = page.content()
    safe_name = marca.replace(" ", "_")
    html_path = DEBUG_DIR / f"{safe_name}.html"
    html_path.write_text(html, encoding="utf-8")
    print(f"      HTML guardado: {html_path}")

    # 2. Screenshot
    screenshot_path = DEBUG_DIR / f"{safe_name}.png"
    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
        print(f"      Screenshot: {screenshot_path}")
    except Exception as e:
        print(f"      No pude tomar screenshot: {e}")

    # 3. Listar todos los elementos cuya clase contiene "price" (en cualquier capitalización)
    print(f"\n      Elementos con clase tipo 'price':")
    try:
        # JS que busca cualquier elemento cuyo className tenga 'price'
        elementos = page.evaluate("""
            () => {
                const out = [];
                document.querySelectorAll('*').forEach(el => {
                    const cls = el.className;
                    const clsStr = typeof cls === 'string' ? cls : (cls?.baseVal || '');
                    if (/price|precio/i.test(clsStr)) {
                        const text = (el.innerText || '').trim();
                        if (text && text.length < 100) {
                            out.push({
                                tag: el.tagName.toLowerCase(),
                                cls: clsStr.slice(0, 80),
                                text: text.slice(0, 80)
                            });
                        }
                    }
                });
                return out.slice(0, 30);
            }
        """)
        if elementos:
            for e in elementos:
                print(f"        <{e['tag']} class='{e['cls']}'> -> '{e['text']}'")
        else:
            print(f"        (ninguno)")
    except Exception as e:
        print(f"        Error: {e}")

    # 4. Buscar todos los textos que contengan "Bs"
    print(f"\n      Textos que contienen 'Bs':")
    try:
        bs_texts = page.evaluate("""
            () => {
                const out = [];
                const walker = document.createTreeWalker(
                    document.body,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );
                let node;
                while (node = walker.nextNode()) {
                    const text = node.textContent.trim();
                    if (text.includes('Bs') && text.length < 80) {
                        out.push(text);
                    }
                }
                return out.slice(0, 30);
            }
        """)
        if bs_texts:
            for t in bs_texts:
                print(f"        '{t}'")
        else:
            print(f"        (ninguno con 'Bs')")
    except Exception as e:
        print(f"        Error: {e}")


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: no encuentro {CSV_PATH}")
        sys.exit(1)

    DEBUG_DIR.mkdir(exist_ok=True)

    filas = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            if (
                row.get("cadena", "").strip().lower() == "farmatodo"
                and row.get("activo", "").strip().lower() == "si"
            ):
                filas.append(row)

    print(f"Diagnóstico de {len(filas)} URLs de Farmatodo...\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # IMPORTANTE: NO bloqueamos imágenes/fonts esta vez.
        # Queremos ver la página tal cual la ve el usuario.
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
            print(f"[{i}/{len(filas)}] -> {fila['marca']} ({fila['tipo']})", flush=True)
            try:
                diagnostic_url(page, fila["url"], fila["marca"])
            except Exception as e:
                print(f"   ERROR: {e}")
            print()

        browser.close()


if __name__ == "__main__":
    main()
