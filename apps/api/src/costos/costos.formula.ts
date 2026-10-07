/**
 * Evaluador de fórmulas de costo. Parser de descenso recursivo con una lista
 * blanca de operadores y funciones; NUNCA usa `eval`. Pensado para que el admin
 * defina el cálculo del costo de cada producto como una expresión sobre claves.
 *
 * Gramática:
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := ('-' | '+') factor | primary
 *   primary:= número | clave | función '(' args ')' | '(' expr ')'
 *   args   := expr (',' expr)*
 */

export class FormulaError extends Error {}

export const FUNCIONES_FORMULA = ["min", "max", "round", "sum", "abs"] as const;

type Token =
  | { tipo: "num"; valor: number; pos: number }
  | { tipo: "id"; valor: string; pos: number }
  | { tipo: "op"; valor: string; pos: number }
  | { tipo: "lparen"; pos: number }
  | { tipo: "rparen"; pos: number }
  | { tipo: "comma"; pos: number };

const RE_ID = /[A-Za-z_][A-Za-z0-9_]*/;

function tokenizar(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      const num = Number(src.slice(start, i));
      if (!Number.isFinite(num)) throw new FormulaError(`Número inválido en la posición ${start + 1}`);
      tokens.push({ tipo: "num", valor: num, pos: start });
      continue;
    }
    if (ch === "." && /[0-9]/.test(src[i + 1] ?? "")) {
      const start = i;
      i++;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      const num = Number(src.slice(start, i));
      if (!Number.isFinite(num)) throw new FormulaError(`Número inválido en la posición ${start + 1}`);
      tokens.push({ tipo: "num", valor: num, pos: start });
      continue;
    }
    const id = RE_ID.exec(src.slice(i));
    if (id && id.index === 0) {
      tokens.push({ tipo: "id", valor: id[0], pos: i });
      i += id[0].length;
      continue;
    }
    if (ch === "(") {
      tokens.push({ tipo: "lparen", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ tipo: "rparen", pos: i });
      i++;
      continue;
    }
    if (ch === ",") {
      tokens.push({ tipo: "comma", pos: i });
      i++;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ tipo: "op", valor: ch, pos: i });
      i++;
      continue;
    }
    throw new FormulaError(`Carácter no permitido "${ch}" en la posición ${i + 1}`);
  }
  return tokens;
}

export function clavesFormula(src: string): string[] {
  return [
    ...new Set(
      tokenizar(src)
        .filter((t): t is Extract<Token, { tipo: "id" }> => t.tipo === "id")
        .map((t) => t.valor)
        .filter((id) => !(FUNCIONES_FORMULA as readonly string[]).includes(id)),
    ),
  ];
}

export function evaluarFormula(src: string, entorno: Record<string, number>): number {
  const tokens = tokenizar(src);
  let pos = 0;

  const ver = () => tokens[pos];
  const com = () => tokens[pos++];

  const esperar = (cond: boolean, msg: string) => {
    if (!cond) throw new FormulaError(msg);
  };

  function parseExpr(): number {
    let izquierda = parseTerm();
    while (ver()?.tipo === "op" && ["+", "-"].includes((ver() as { valor: string }).valor)) {
      const op = (com() as { valor: string }).valor;
      const derecha = parseTerm();
      izquierda = op === "+" ? izquierda + derecha : izquierda - derecha;
    }
    return izquierda;
  }

  function parseTerm(): number {
    let izquierda = parseFactor();
    while (ver()?.tipo === "op" && ["*", "/"].includes((ver() as { valor: string }).valor)) {
      const op = (com() as { valor: string }).valor;
      const derecha = parseFactor();
      if (op === "/") {
        if (derecha === 0) throw new FormulaError("División por cero en la fórmula");
        izquierda = izquierda / derecha;
      } else {
        izquierda = izquierda * derecha;
      }
    }
    return izquierda;
  }

  function parseFactor(): number {
    const t = ver();
    if (t?.tipo === "op" && (t.valor === "-" || t.valor === "+")) {
      com();
      const v = parseFactor();
      return t.valor === "-" ? -v : v;
    }
    return parsePrimary();
  }

  function parsePrimary(): number {
    const t = ver();
    if (!t) throw new FormulaError("La fórmula termina de forma inesperada");
    if (t.tipo === "num") {
      com();
      return t.valor;
    }
    if (t.tipo === "lparen") {
      com();
      const v = parseExpr();
      esperar(ver()?.tipo === "rparen", "Falta un paréntesis de cierre");
      com();
      return v;
    }
    if (t.tipo === "id") {
      com();
      if (ver()?.tipo === "lparen") {
        return parseFuncion(t.valor);
      }
      if (!(t.valor in entorno)) throw new FormulaError(`La clave "${t.valor}" no está definida`);
      return entorno[t.valor];
    }
    throw new FormulaError(`Token inesperado en la posición ${t.pos + 1}`);
  }

  function parseFuncion(nombre: string): number {
    esperar((FUNCIONES_FORMULA as readonly string[]).includes(nombre), `Función desconocida "${nombre}"`);
    com(); // consume '('
    const args: number[] = [];
    if (ver()?.tipo !== "rparen") {
      args.push(parseExpr());
      while (ver()?.tipo === "comma") {
        com();
        args.push(parseExpr());
      }
    }
    esperar(ver()?.tipo === "rparen", `Falta cerrar la función "${nombre}("`);
    com();
    switch (nombre) {
      case "min":
        esperar(args.length > 0, "min() necesita al menos un argumento");
        return Math.min(...args);
      case "max":
        esperar(args.length > 0, "max() necesita al menos un argumento");
        return Math.max(...args);
      case "sum":
        return args.reduce((a, b) => a + b, 0);
      case "abs":
        esperar(args.length === 1, "abs() necesita un argumento");
        return Math.abs(args[0]);
      case "round": {
        esperar(args.length === 1 || args.length === 2, "round() necesita 1 o 2 argumentos");
        const nd = args.length === 2 ? args[1] : 0;
        const f = Math.pow(10, nd);
        return Math.round((args[0] + Number.EPSILON) * f) / f;
      }
      default:
        throw new FormulaError(`Función desconocida "${nombre}"`);
    }
  }

  const resultado = parseExpr();
  esperar(pos === tokens.length, `Sobra contenido a partir de la posición ${(tokens[pos]?.pos ?? 0) + 1}`);
  esperar(Number.isFinite(resultado), "El resultado de la fórmula no es un número válido");
  return resultado;
}
