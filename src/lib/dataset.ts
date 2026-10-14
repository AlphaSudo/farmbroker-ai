// Deterministic 100-row supplier dataset (mirrors pal/data/gen-suppliers.mjs).
// Rows 0-2 = locked video demo subset. Used by /api/hub/import + scripts.
export interface DatasetRow { name: string; crop: string; qty: number; loc: string; score: number; price: number; }

const FIRST: DatasetRow[] = [
  { name: "Ahmed", crop: "Mint", qty: 2000, loc: "Menoufia", score: 92, price: 7.0 },
  { name: "Mohamed", crop: "Mint", qty: 3000, loc: "Menoufia", score: 88, price: 7.5 },
  { name: "Ali", crop: "Mint", qty: 5000, loc: "Giza", score: 90, price: 7.3 },
];

const NAMES = ["Omar","Youssef","Mahmoud","Ibrahim","Hassan","Fatma","Mona","Sara","Khaled","Tarek","Hoda","Nadia","Adel","Samir","Reda","Hany","Wael","Ashraf","Dina","Rania","Karim","Hisham","Gamal","Fathy","Nabil","Salem","Aziz","Farouk","Lotfy","Mamdouh","Sobhy","Ramadan","Shawky","Zaki","Fawzy","Hamdy","Saeed","Anwar","Bassem","Emad","Fady","George","Hanna","Magdy","Nagy","Raouf","Samy","Talaat","Wafik","Yasser","Zakaria","Mostafa","Ehab","Sherif","Amr","Ayman","Hazem","Islam","Kareem","Marwan"];
const CROPS = ["Mint", "Basil", "Lettuce"];
const LOCS = ["Menoufia", "Giza", "Qalyubia", "Beheira", "Sharqia", "Cairo", "Fayoum"];
const BASE: Record<string, number> = { Mint: 7.0, Basil: 9.0, Lettuce: 4.0 };

export function generateDataset(): DatasetRow[] {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
  const rows = [...FIRST];
  for (let i = rows.length; i < 100; i++) {
    const crop = CROPS[Math.floor(rnd() * CROPS.length)];
    rows.push({
      name: NAMES[(i - 3) % NAMES.length] + (i >= 3 + NAMES.length ? ` ${Math.floor((i - 3) / NAMES.length) + 1}` : ""),
      crop, qty: 500 + Math.floor(rnd() * 4500), loc: LOCS[Math.floor(rnd() * LOCS.length)],
      score: 70 + Math.floor(rnd() * 30), price: +(BASE[crop] + rnd() * 2).toFixed(1),
    });
  }
  return rows;
}
