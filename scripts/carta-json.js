// Genera data/carta.json desde la migración de datos de Supabase, con la misma forma
// que devuelve la función carta_publica(). Así el mockup local y Supabase usan los mismos datos.
// Uso: node scripts/carta-json.js
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const sqlFile = path.join(root, "supabase/migrations/20261010120100_carta_datos.sql");
const outFile = path.join(root, "data/carta.json");

// Lee los INSERT del archivo de datos (una fila por línea, formato generado).
function parseInserts(sql) {
  const tables = {};
  for (const m of sql.matchAll(/insert into public\.(\w+) \(([^)]*)\) values\n([\s\S]*?);\n/g)) {
    const cols = m[2].split(", ");
    tables[m[1]] = m[3].split(/,\n/).map(line => {
      const v = line.trim().replace(/^\(|\)$/g, "");
      const vals = [];
      let i = 0;
      const str = () => { let j = i + 1, s = ""; for (;;) { if (v[j] === "'" && v[j + 1] === "'") { s += "'"; j += 2; continue; } if (v[j] === "'") break; s += v[j++]; } i = j + 1; return s; };
      while (i < v.length) {
        if (v[i] === " " || v[i] === ",") { i++; continue; }
        if (v.startsWith("array[", i)) {
          i += 6; const items = [];
          while (v[i] !== "]") { if (v[i] === "'") items.push(str()); else i++; }
          i = v.indexOf("::text[]", i) + 8; vals.push(items); continue;
        }
        if (v.startsWith("'{}'::text[]", i)) { vals.push([]); i += 12; continue; }
        if (v[i] === "'") { const s = str(); if (v.startsWith("::jsonb", i)) { vals.push(JSON.parse(s)); i += 7; } else vals.push(s); continue; }
        const j = v.slice(i).search(/,|$/); const t = v.slice(i, i + j).trim(); i += j;
        vals.push(t === "null" ? null : t === "true" ? true : t === "false" ? false : Number(t));
      }
      if (vals.length !== cols.length) throw new Error(`Fila con ${vals.length} valores en ${m[1]}, se esperaban ${cols.length}: ${line}`);
      return Object.fromEntries(cols.map((c, k) => [c, vals[k]]));
    });
  }
  return tables;
}

const t = parseInserts(fs.readFileSync(sqlFile, "utf8"));
const byOrder = (a, b) => a.orden - b.orden;
const cat = Object.fromEntries(t.categorias.map(c => [c.id, c]));
const carta = {
  categorias: [...t.categorias].sort(byOrder),
  productos: t.productos
    .map(p => ({ ...p, rolls: t.tabla_rolls.filter(r => r.producto_id === p.id).sort(byOrder).map(r => ({ nombre: r.nombre, ingredientes: r.ingredientes, cantidad: r.cantidad })), platos: t.mas_alla_platos.filter(m => m.producto_id === p.id).sort(byOrder).map(m => ({ nombre: m.nombre, descripcion: m.descripcion, precio: m.precio, quitables: m.quitables })) }))
    .sort((a, b) => cat[a.categoria_id].orden - cat[b.categoria_id].orden || a.orden - b.orden),
  cambios: [...t.cambios].sort(byOrder),
  proteinas: [...t.proteinas].sort(byOrder).map(p => p.nombre),
  armador: {
    coberturas: [...t.armador_coberturas].sort(byOrder),
    bases: [...t.armador_bases].sort(byOrder),
    ingredientes: [...t.armador_ingredientes].sort(byOrder),
  },
  config: Object.fromEntries(t.config.map(c => [c.clave, c.valor])),
};
fs.writeFileSync(outFile, JSON.stringify(carta, null, 1) + "\n");
console.log(`data/carta.json: ${carta.categorias.length} categorías, ${carta.productos.length} productos`);
