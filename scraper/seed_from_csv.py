"""
Carga inicial: lee los 4 CSVs y los sube a Firestore.

Colecciones que crea/actualiza:
    productos                (de productos.csv)
    cadenas                  (de cadenas.csv)
    productos_competencia    (de productos_competencia.csv)
    usuarios                 (de usuarios.csv)

Es idempotente: lo puedes correr varias veces, los documentos
se actualizan, no se duplican.

Uso:
    python scraper/seed_from_csv.py
"""

import csv
import sys
from pathlib import Path

from firebase_client import get_db


PROJECT_ROOT = Path(__file__).parent.parent


def read_csv(path: Path, delimiter: str = ";"):
    if not path.exists():
        print(f"  AVISO: no encuentro {path.name}, lo salto.")
        return []
    with open(path, encoding="utf-8") as f:
        # Detectar delimitador automáticamente (coma o punto y coma)
        sample = f.read(2048)
        f.seek(0)
        if sample.count(";") > sample.count(","):
            delim = ";"
        else:
            delim = ","
        return list(csv.DictReader(f, delimiter=delim))


def es_si(valor: str) -> bool:
    return str(valor).strip().lower() in ("si", "sí", "yes", "true", "1")


def parse_float(valor: str) -> float | None:
    if valor is None or valor == "":
        return None
    try:
        # Manejar formato venezolano "1.234,56" o gringo "1234.56"
        s = str(valor).strip()
        if "," in s and "." in s:
            s = s.replace(".", "").replace(",", ".")
        elif "," in s:
            s = s.replace(",", ".")
        return float(s)
    except ValueError:
        return None


def seed_productos(db):
    rows = read_csv(PROJECT_ROOT / "productos.csv")
    print(f"productos: {len(rows)} filas")
    for row in rows:
        doc_id = row["id_interno"].strip()
        db.collection("productos").document(doc_id).set(
            {
                "id_interno": doc_id,
                "nombre": row.get("nombre", "").strip(),
                "laboratorio": row.get("laboratorio", "").strip(),
                "principio_activo": row.get("principio_activo", "").strip(),
                "presentacion": row.get("presentacion", "").strip(),
                "categoria": row.get("categoria", "").strip(),
                "pvp_propio_usd": parse_float(row.get("pvp_propio_usd")),
                "activo": es_si(row.get("activo", "")),
            }
        )


def seed_cadenas(db):
    rows = read_csv(PROJECT_ROOT / "cadenas.csv")
    print(f"cadenas: {len(rows)} filas")
    for row in rows:
        doc_id = row["nombre"].strip().replace(" ", "_")
        db.collection("cadenas").document(doc_id).set(
            {
                "nombre": row.get("nombre", "").strip(),
                "website": row.get("website", "").strip(),
                "scraper_modulo": row.get("scraper_modulo", "").strip(),
                "activo": es_si(row.get("activo", "")),
            }
        )


def seed_productos_competencia(db):
    rows = read_csv(PROJECT_ROOT / "productos_competencia.csv")
    print(f"productos_competencia: {len(rows)} filas")
    for row in rows:
        prod_id = row["id_producto_propio"].strip()
        cadena = row["cadena"].strip()
        marca = row.get("marca", "").strip()
        doc_id = f"{prod_id}_{cadena}_{marca}".replace(" ", "_")

        db.collection("productos_competencia").document(doc_id).set(
            {
                "id_producto_propio": prod_id,
                "cadena": cadena,
                "tipo": row.get("tipo", "").strip(),
                "marca": marca,
                "url": row.get("url", "").strip(),
                "activo": es_si(row.get("activo", "")),
            },
            merge=True,  # merge para no borrar ultimo_scrape, etc., si ya existen
        )


def seed_usuarios(db):
    rows = read_csv(PROJECT_ROOT / "usuarios.csv")
    print(f"usuarios: {len(rows)} filas")
    for row in rows:
        email = row["email"].strip().lower()
        doc_id = email.replace("@", "_at_").replace(".", "_")
        db.collection("usuarios").document(doc_id).set(
            {
                "email": email,
                "nombre": row.get("nombre", "").strip(),
                "rol": row.get("rol", "").strip().lower(),
                "recibe_alertas_inmediatas": es_si(row.get("recibe_alertas_inmediatas", "")),
                "recibe_resumen_diario": es_si(row.get("recibe_resumen_diario", "")),
                "activo": es_si(row.get("activo", "")),
            }
        )


def main():
    db = get_db()
    print("Cargando datos a Firestore...\n")
    seed_productos(db)
    seed_cadenas(db)
    seed_productos_competencia(db)
    seed_usuarios(db)
    print("\nCarga completa.")


if __name__ == "__main__":
    main()
