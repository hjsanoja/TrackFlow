"""
Sube los resultados del scraper (resultados.json) a Firestore.

Tres escrituras por cada producto exitoso:
1. historico_precios: agrega un documento nuevo (mantiene historia)
2. productos_competencia: actualiza ultimo_scrape y estado
3. scrape_runs: registra la corrida completa al final

Uso:
    python scraper/push_to_firestore.py
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from firebase_client import get_db


PROJECT_ROOT = Path(__file__).parent.parent
RESULTS_PATH = PROJECT_ROOT / "resultados.json"


def main():
    if not RESULTS_PATH.exists():
        print(f"ERROR: no encuentro {RESULTS_PATH}")
        print("Corre primero: python scraper/farmatodo.py")
        sys.exit(1)

    with open(RESULTS_PATH, encoding="utf-8") as f:
        resultados = json.load(f)

    if not resultados:
        print("resultados.json está vacío.")
        sys.exit(0)

    db = get_db()
    print(f"Subiendo {len(resultados)} resultados a Firestore...\n")

    ahora = datetime.now(timezone.utc)
    run_id = ahora.strftime("%Y%m%d_%H%M%S")
    ok = 0
    errores = 0

    for r in resultados:
        # Identificador estable: id_producto + cadena + marca
        # (un producto propio puede aparecer varias veces en una cadena con marcas diferentes)
        prod_comp_id = f"{r['id_producto_propio']}_{r['cadena']}_{r['marca']}".replace(" ", "_")

        if r.get("error"):
            print(f"  Skipping {r['marca']}: {r['error']}")
            errores += 1
            # Aún así actualizamos el estado en productos_competencia
            db.collection("productos_competencia").document(prod_comp_id).set(
                {
                    "id_producto_propio": r["id_producto_propio"],
                    "cadena": r["cadena"],
                    "marca": r["marca"],
                    "tipo": r["tipo"],
                    "url": r["url"],
                    "ultimo_scrape": ahora,
                    "estado": "error",
                    "ultimo_error": r["error"],
                },
                merge=True,
            )
            continue

        # 1. historico_precios: documento nuevo cada corrida
        historico_doc = {
            "prod_comp_id": prod_comp_id,
            "id_producto_propio": r["id_producto_propio"],
            "cadena": r["cadena"],
            "marca": r["marca"],
            "tipo": r["tipo"],
            "nombre": r["nombre"],
            "precio_full_bs": r["precio_full_bs"],
            "precio_desc_bs": r["precio_desc_bs"],
            "tiene_descuento": r["tiene_descuento"],
            "scraped_at": ahora,
            "run_id": run_id,
        }
        db.collection("historico_precios").add(historico_doc)

        # 2. productos_competencia: actualizar ultimo_scrape y estado
        db.collection("productos_competencia").document(prod_comp_id).set(
            {
                "id_producto_propio": r["id_producto_propio"],
                "cadena": r["cadena"],
                "marca": r["marca"],
                "tipo": r["tipo"],
                "url": r["url"],
                "ultimo_scrape": ahora,
                "ultimo_precio_full_bs": r["precio_full_bs"],
                "ultimo_precio_desc_bs": r["precio_desc_bs"],
                "ultimo_nombre": r["nombre"],
                "estado": "ok",
            },
            merge=True,
        )

        ok += 1
        print(f"  OK: {r['marca']} -> Bs {r['precio_full_bs']:,.2f}")

    # 3. scrape_runs: registro de la corrida
    db.collection("scrape_runs").document(run_id).set(
        {
            "run_id": run_id,
            "started_at": ahora,
            "total": len(resultados),
            "ok": ok,
            "errores": errores,
            "trigger": "manual",  # después GitHub Actions lo cambia a "scheduled"
        }
    )

    print(f"\nListo: {ok} OK, {errores} errores")
    print(f"Run ID: {run_id}")


if __name__ == "__main__":
    main()
