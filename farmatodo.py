"""
Scraper de Farmatodo.

Lee productos_competencia.csv, abre cada URL marcada como cadena=Farmatodo,
extrae el precio y lo imprime por pantalla.

Uso:
    python farmatodo.py

Requiere:
    pip install playwright
    playwright install chromium
"""

import csv
import re
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout


# Ruta al CSV. Asume que el CSV está en la raíz del proyecto, un nivel arriba.
CSV_PATH = Path(__file__).parent.parent / "productos_competencia.csv"


def parse_price(text: str) -> float | None:
    """
    Convierte un string como 'Bs.6.705,00' o 'Bs. 1.234,56' a float.
    Farmatodo usa formato venezolano: punto como separador de miles,
    coma como separador decimal.
    """
    if not text:
        return None

    # Quitar todo lo que no sea dígito, punto o coma
    cleaned = re.sub(r"[^\d.,]", "", text)
    if not cleaned:
        return None

    # Si tiene coma, la coma es el decimal y los puntos son miles
    if "," in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    # Si solo tiene puntos y hay más de uno, los puntos son miles
    elif cleaned.count(".") > 1:
        cleaned = cleaned.replace(".", "")

    try:
        return float(cleaned)
    except ValueError:
        return None


def scrape_farmatodo_url(page, url: str) -> dict:
    """
    Abre la URL en Farmatodo y extrae nombre, precio full y precio con descuento.
    Devuelve un dict con los datos. Si falla, los campos vienen en None
    y 'error' tiene el motivo.
    """
    result = {
        "url": url,
        "nombre": None,
        "precio_full_bs": None,
        "precio_desc_bs": None,
        "error": None,
    }

    try:
        # networkidle: espera a que no haya peticiones de red por 500ms.
        # Farmatodo carga el precio con JS, así que esto es necesario.
        page.goto(url, wait_until="networkidle", timeout=30000)

        # Selectores tolerantes: buscamos por varias estrategias y usamos
        # la primera que encuentre algo. Esto sobrevive a cambios menores
        # en el HTML.
        nombre_sel = [
            "h1",
            "[class*='product-title']",
            "[class*='product-name']",
        ]
        for sel in nombre_sel:
            try:
                el = page.locator(sel).first
                if el.count() > 0:
                    text = el.inner_text(timeout=2000).strip()
                    if text:
                        result["nombre"] = text
                        break
            except PlaywrightTimeout:
                continue

        # Para el precio, capturamos todos los elementos que parezcan precio
        # y elegimos según presencia de descuento.
        # Farmatodo suele usar clases con 'price' en el nombre.
        price_locators = page.locator(
            "[class*='price'], [class*='Price'], [class*='precio']"
        )
        textos_precio = []
        for i in range(min(price_locators.count(), 20)):
            try:
                t = price_locators.nth(i).inner_text(timeout=1000).strip()
                if t and ("Bs" in t or "$" in t or re.search(r"\d", t)):
                    textos_precio.append(t)
            except PlaywrightTimeout:
                continue

        # Filtrar a precios con dígitos y signo de Bs
        precios_validos = []
        for t in textos_precio:
            p = parse_price(t)
            if p and p > 0:
                precios_validos.append((t, p))

        if precios_validos:
            # Asunción: el primer precio que aparece es el "principal mostrado".
            # Si hay varios distintos, el menor suele ser el de descuento y el
            # mayor el full. Esto lo afinaremos cuando veamos un caso real.
            valores = sorted({p for _, p in precios_validos})
            if len(valores) == 1:
                result["precio_full_bs"] = valores[0]
            else:
                result["precio_full_bs"] = valores[-1]
                result["precio_desc_bs"] = valores[0]

        if result["precio_full_bs"] is None:
            result["error"] = "No se encontró precio en la página"

    except PlaywrightTimeout:
        result["error"] = "Timeout al cargar la página"
    except Exception as e:
        result["error"] = f"{type(e).__name__}: {e}"

    return result


def main():
    if not CSV_PATH.exists():
        print(f"ERROR: no encuentro {CSV_PATH}")
        print("Pon el archivo productos_competencia.csv en la raíz del proyecto.")
        sys.exit(1)

    # Leer CSV (separador ;)
    filas = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter=";")
        for row in reader:
            if row.get("cadena", "").strip().lower() == "farmatodo" and \
               row.get("activo", "").strip().lower() == "si":
                filas.append(row)

    if not filas:
        print("No hay filas de Farmatodo activas en el CSV.")
        sys.exit(0)

    print(f"Voy a scrapear {len(filas)} URLs de Farmatodo...\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
        )
        page = context.new_page()

        for fila in filas:
            print(f"-> {fila['marca']} ({fila['tipo']})")
            r = scrape_farmatodo_url(page, fila["url"])
            if r["error"]:
                print(f"   ERROR: {r['error']}")
            else:
                print(f"   Nombre: {r['nombre']}")
                if r["precio_desc_bs"]:
                    print(f"   Precio full:      Bs {r['precio_full_bs']:,.2f}")
                    print(f"   Precio descuento: Bs {r['precio_desc_bs']:,.2f}")
                else:
                    print(f"   Precio: Bs {r['precio_full_bs']:,.2f}")
            print()

        browser.close()


if __name__ == "__main__":
    main()
