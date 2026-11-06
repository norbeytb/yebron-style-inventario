#!/usr/bin/env python3
"""Lee el Excel "Yebron Style Listado" (hojas 2025 y 2026) y escribe un JSON
con los pedidos limpios, para `npm run importar-pedidos`.

Uso: python3 scripts/extraer_pedidos.py Listado.xlsx pedidos.json

- Bodega: se unifican las variantes (Tania/Tania /Tanaia, MN/Mn, Og/OG Sneaker...).
- Cliente = primera palabra del texto; el resto es el modelo. El texto original
  completo queda en `textoOriginal` (se guarda en la nota) y las filas dudosas
  salen en `revisar`.
- Talla = "EUR 37" si aparece en el texto.
- Fecha vacía (hoja 2025): se usa la última fecha vista; si no hay, 2025-01-01.
"""
import json, re, sys, datetime
import openpyxl

CANON = {
    'tania': 'Tania', 'tanaia': 'Tania', 'mn': 'MN', 'mn importaciones': 'MN',
    'ml sport': 'ML Sport', 'ml': 'ML Sport', 'og sneaker': 'Og Sneaker', 'og': 'Og Sneaker',
    'os sneaker': 'Og Sneaker', 'silvia': 'Silvia', 'los angeles': 'Los Angeles', 'las vegas': 'Las Vegas',
    'betel': 'Betel', 'mi bodega': 'Mi bodega', 'all china': 'All China', 'all china bogota': 'All China',
    'paisa shop': 'Paisa Shop', 'castristore': 'Castristore',
}

def bodega(v):
    if not v: return None
    k = re.sub(r'\s+', ' ', str(v)).strip().lower()
    return CANON.get(k, re.sub(r'\s+', ' ', str(v)).strip().title())

def num(v):
    return float(v) if isinstance(v, (int, float)) else 0.0

def extraer(ws, anio):
    out, revisar, ultima = [], [], None
    for i, r in enumerate(ws.iter_rows(min_row=3, values_only=True), start=3):
        if not isinstance(r[3], (int, float)) or not r[2]:
            continue
        if isinstance(r[0], datetime.datetime): ultima = r[0].date()
        fecha = ultima or datetime.date(anio, 1, 1)
        texto = re.sub(r'\s+', ' ', str(r[2])).strip()
        m = re.search(r'EUR\s*\d+', texto, re.I)
        talla = re.sub(r'\s+', ' ', m.group(0)).upper() if m else None
        partes = texto.split(' ', 1)
        cliente = partes[0].strip(' -') or texto
        modelo = partes[1].strip(' -') if len(partes) > 1 else ''
        venta, abono = num(r[4]), num(r[8])
        fila = {
            'idOrigen': f'xlsx-{anio}-{i}', 'fecha': fecha.isoformat(), 'cliente': cliente, 'bodega': bodega(r[1]),
            'referencia': modelo, 'talla': talla, 'unidades': int(r[3]) or 1, 'venta': venta, 'costo': num(r[5]),
            'envio': num(r[6]), 'abono': min(abono, venta), 'estado': 'entregado',
            'textoOriginal': texto,
        }
        out.append(fila)
        if not r[0] or not r[1] or len(texto.split()) > 6 or not modelo:
            revisar.append({'hoja': str(anio), 'fila': i, 'texto': texto, 'sinFecha': not r[0], 'sinBodega': not r[1]})
    return out, revisar

if __name__ == '__main__':
    wb = openpyxl.load_workbook(sys.argv[1], data_only=False)
    pedidos, revisar = [], []
    for hoja in ('2025', '2026'):
        p, rv = extraer(wb[hoja], int(hoja)); pedidos += p; revisar += rv
    json.dump({'pedidos': pedidos, 'revisar': revisar}, open(sys.argv[2], 'w'), ensure_ascii=False, indent=1)
    print(f'{len(pedidos)} pedidos, {len(revisar)} para revisar')
