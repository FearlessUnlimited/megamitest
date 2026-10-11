// Genera negocio.html con su contenido cifrado, para publicarlo en un repo público.
// La fuente en texto plano vive fuera del repo: ../privado/negocio.html (carpeta Megami).
// Se cifra lo que está entre <!-- protegido:inicio --> y <!-- protegido:fin -->; el resto
// (estilos y barra superior) queda público. La página lo descifra en el navegador con la clave.
//
// Cifrado: AES-GCM de 256 bits con clave derivada por PBKDF2-SHA256 (600.000 iteraciones)
// y sal e IV aleatorios en cada ejecución. La seguridad depende de que la clave sea larga.
//
// Uso: node scripts/cifrar-negocio.js   (pide la clave dos veces y muestra asteriscos)
const fs = require("fs");
const path = require("path");
const { webcrypto } = require("crypto");

const root = path.join(__dirname, "..");
const srcFile = path.join(root, "../privado/negocio.html");
const outFile = path.join(root, "negocio.html");
const ITERACIONES = 600000;
const LARGO_MINIMO = 12;
const INICIO = "<!-- protegido:inicio -->";
const FIN = "<!-- protegido:fin -->";

// Lee la clave sin mostrarla: un asterisco por carácter, para notar si falta o sobra alguno.
// Windows puede mandar el Enter como "\r\n" en dos partes y el pegado con marcas de escape:
// el "\n" que sigue a un "\r" se descarta (también si llega en la lectura siguiente) y las
// secuencias de escape no cuentan como parte de la clave.
let ultimoFueRetorno = false;
function pedirClave(texto) {
  return new Promise((ok, mal) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return mal(new Error("Ejecuta el script en una terminal para escribir la clave."));
    process.stdout.write(texto);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let clave = "";
    const alEscribir = chunk => {
      chunk = chunk.replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]/g, "");
      for (const c of chunk) {
        if (c === "\n" && ultimoFueRetorno) { ultimoFueRetorno = false; continue; }
        ultimoFueRetorno = c === "\r";
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", alEscribir);
          process.stdout.write("\n");
          return ok(clave);
        }
        if (c === "\u0003") { process.stdout.write("\n"); process.exit(130); }
        if (c === "\u007f" || c === "\b") {
          if (clave) { clave = [...clave].slice(0, -1).join(""); process.stdout.write("\b \b"); }
          continue;
        }
        if (c < " ") continue;
        clave += c;
        process.stdout.write("*");
      }
    };
    stdin.on("data", alEscribir);
  });
}

async function cifrar(texto, clave) {
  const subtle = webcrypto.subtle;
  const sal = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const base = await subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
  const llave = await subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: ITERACIONES, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const cifrado = await subtle.encrypt({ name: "AES-GCM", iv }, llave, new TextEncoder().encode(texto));
  const b64 = b => Buffer.from(b).toString("base64");
  return { v: 1, iter: ITERACIONES, sal: b64(sal), iv: b64(iv), datos: b64(new Uint8Array(cifrado)) };
}

// Tarjeta de acceso y descifrado en el navegador. La llave derivada se guarda en sessionStorage
// para no pedir la clave otra vez al recargar dentro de la misma pestaña.
function acceso(paquete) {
  return `<div id="protegido">
<div class="acceso">
  <form id="formAcceso" autocomplete="off">
    <p class="eyebrow">Documento interno</p>
    <h1>Plan de negocio</h1>
    <p>Ingresa la clave para ver el documento.</p>
    <label for="clave">Clave</label>
    <input id="clave" type="password" autocomplete="current-password" required autofocus>
    <p class="error" id="errorAcceso" role="alert"></p>
    <button type="submit" id="entrar">Entrar</button>
  </form>
</div>
</div>
<script type="application/json" id="paquete">${JSON.stringify(paquete)}</script>
<script>
(() => {
  const paquete = JSON.parse(document.getElementById("paquete").textContent);
  const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const GUARDADA = "negocio-llave-v" + paquete.v + "-" + paquete.sal;
  const form = document.getElementById("formAcceso");
  const error = document.getElementById("errorAcceso");
  const boton = document.getElementById("entrar");

  async function abrir(llave) {
    const plano = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(paquete.iv) }, llave, bytes(paquete.datos));
    document.getElementById("protegido").outerHTML = new TextDecoder().decode(plano);
    if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
  }

  async function llaveDesdeClave(clave) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(clave), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(paquete.sal), iterations: paquete.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
  }

  if (!window.crypto?.subtle) {
    error.textContent = "Este navegador no puede abrir el documento. Ábrelo desde la dirección https del sitio.";
    boton.disabled = true;
    return;
  }

  (async () => {
    let guardada = null;
    try { guardada = sessionStorage.getItem(GUARDADA); } catch {}
    if (!guardada) return;
    try {
      const llave = await crypto.subtle.importKey("raw", bytes(guardada), "AES-GCM", false, ["decrypt"]);
      await abrir(llave);
    } catch {
      try { sessionStorage.removeItem(GUARDADA); } catch {}
    }
  })();

  form.addEventListener("submit", async e => {
    e.preventDefault();
    error.textContent = "";
    boton.disabled = true;
    boton.textContent = "Abriendo…";
    try {
      const llave = await llaveDesdeClave(document.getElementById("clave").value);
      await abrir(llave);
      try {
        const cruda = new Uint8Array(await crypto.subtle.exportKey("raw", llave));
        sessionStorage.setItem(GUARDADA, btoa(String.fromCharCode(...cruda)));
      } catch {}
    } catch {
      error.textContent = "Clave incorrecta.";
      boton.disabled = false;
      boton.textContent = "Entrar";
      document.getElementById("clave").select();
    }
  });
})();
</script>`;
}

(async () => {
  const fuente = fs.readFileSync(srcFile, "utf8");
  const i = fuente.indexOf(INICIO), f = fuente.indexOf(FIN);
  if (i < 0 || f < i) throw new Error(`No encontré las marcas ${INICIO} y ${FIN} en ${srcFile}`);
  const protegido = fuente.slice(i + INICIO.length, f).trim();

  const clave = await pedirClave("Clave para el plan de negocio: ");
  if (clave.length < LARGO_MINIMO) throw new Error(`La clave debe tener al menos ${LARGO_MINIMO} caracteres.`);
  if (await pedirClave("Repite la clave: ") !== clave) throw new Error("Las claves no coinciden.");

  const paquete = await cifrar(protegido, clave);
  const salida = fuente.slice(0, i) + acceso(paquete) + fuente.slice(f + FIN.length);

  // Control: ningún texto del contenido protegido puede quedar a la vista en la salida.
  const muestras = protegido.replace(/<[^>]+>/g, "\n").split("\n").map(s => s.trim()).filter(s => s.length > 40);
  const filtrada = muestras.find(s => salida.includes(s));
  if (filtrada) throw new Error("Quedó texto sin cifrar en la salida: " + filtrada.slice(0, 60));

  fs.writeFileSync(outFile, salida);
  console.log(`Listo: ${path.relative(process.cwd(), outFile)} (${muestras.length} párrafos cifrados).`);
})().catch(e => { console.error(e.message); process.exit(1); });
