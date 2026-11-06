// extraer-pedidos.ts
//
// Lee el Excel "Yebron Style Listado" (hojas 2025 y 2026) y escribe un JSON
// con los pedidos limpios, que después carga importar-pedidos.ts.
// Uso:  npm run extraer-pedidos -- Listado.xlsx pedidos.json
//
// - Bodega: se unifican las variantes (Tania/Tania /Tanaia, MN/Mn, Og/OG Sneaker...).
// - Cliente = primera palabra del texto; el resto es el modelo. El texto
//   original completo se guarda en `textoOriginal` y las filas dudosas salen
//   en `revisar`.
// - Talla = "EUR 37" si aparece en el texto.
// - Fecha vacía (hoja 2025): se usa la última fecha vista; si no hay, 1/ene.

import { writeFileSync } from 'fs';
import * as ExcelJS from 'exceljs';

const CANON: Record<string, string> = {
  tania: 'Tania', tanaia: 'Tania', mn: 'MN', 'mn importaciones': 'MN', 'ml sport': 'ML Sport', ml: 'ML Sport',
  'og sneaker': 'Og Sneaker', og: 'Og Sneaker', 'os sneaker': 'Og Sneaker', silvia: 'Silvia',
  'los angeles': 'Los Angeles', 'las vegas': 'Las Vegas', betel: 'Betel', 'mi bodega': 'Mi bodega',
  'all china': 'All China', 'all china bogota': 'All China', 'paisa shop': 'Paisa Shop', castristore: 'Castristore',
};

const limpiar = (v: any) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v: any) => (typeof v === 'number' ? v : 0);

function bodega(v: any): string | null {
  const t = limpiar(v);
  if (!t) return null;
  return CANON[t.toLowerCase()] || t.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

function extraer(ws: ExcelJS.Worksheet, anio: number) {
  const pedidos: any[] = [], revisar: any[] = [];
  let ultima: string | null = null;
  ws.eachRow({ includeEmpty: false }, (row, i) => {
    if (i < 3) return;
    const [fecha, bod, txt, uni, venta, costo, envio, , abono] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c) => row.getCell(c).value);
    if (typeof uni !== 'number' || !txt) return;
    if (fecha instanceof Date) ultima = fecha.toISOString().slice(0, 10);
    const texto = limpiar(typeof txt === 'object' ? (txt as any).text ?? (txt as any).result : txt);
    const talla = texto.match(/EUR\s*\d+/i)?.[0].replace(/\s+/g, ' ').toUpperCase() || null;
    const espacio = texto.indexOf(' ');
    const cliente = (espacio < 0 ? texto : texto.slice(0, espacio)).replace(/^[\s-]+|[\s-]+$/g, '') || texto;
    const modelo = espacio < 0 ? '' : texto.slice(espacio + 1).replace(/^[\s-]+|[\s-]+$/g, '');
    pedidos.push({
      idOrigen: `xlsx-${anio}-${i}`, fecha: ultima || `${anio}-01-01`, cliente, bodega: bodega(bod),
      referencia: modelo, talla, unidades: Math.round(uni) || 1, venta: num(venta), costo: num(costo), envio: num(envio),
      abono: Math.min(num(abono), num(venta)), estado: 'entregado', textoOriginal: texto,
    });
    if (!(fecha instanceof Date) || !bod || texto.split(' ').length > 6 || !modelo) {
      revisar.push({ hoja: String(anio), fila: i, texto, sinFecha: !(fecha instanceof Date), sinBodega: !bod });
    }
  });
  return { pedidos, revisar };
}

async function main() {
  const [entrada, salida] = process.argv.slice(2);
  if (!entrada || !salida) {
    console.error('Uso: npm run extraer-pedidos -- Listado.xlsx pedidos.json');
    process.exit(1);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(entrada);
  const todo = { pedidos: [] as any[], revisar: [] as any[] };
  for (const hoja of ['2025', '2026']) {
    const ws = wb.getWorksheet(hoja);
    if (!ws) { console.error(`No encontré la hoja ${hoja}.`); process.exit(1); }
    const r = extraer(ws, Number(hoja));
    todo.pedidos.push(...r.pedidos); todo.revisar.push(...r.revisar);
  }
  writeFileSync(salida, JSON.stringify(todo, null, 1));
  console.log(`${todo.pedidos.length} pedidos, ${todo.revisar.length} para revisar → ${salida}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
