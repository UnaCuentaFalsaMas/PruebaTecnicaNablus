import { Order, getOrdersDb } from "@/lib/data";
import { calcTotals } from "@/lib/totals";

export type OrdersQuery = {
  q?: string;
  status?: "pending" | "paid" | "canceled" | "all";
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  sort?: "issuedAt" | "total";
  dir?: "asc" | "desc";
};

export type OrderRow = {
  id: string;
  customerName: string;
  customerRut: string;
  issuedAt: string;
  net: number;
  vat: number;
  total: number;
  status: "pending" | "paid" | "canceled";
};

export type OrdersResponse = {
  data: OrderRow[];
  summary: {
    count: number;
    totalNet: number;
    totalVat: number;
    totalGross: number;
    byStatus: Record<"pending" | "paid" | "canceled", number>;
  };
};

export async function listOrders(_q: OrdersQuery): Promise<OrdersResponse> {
  // TODO (candidato):
// 1) Obtener data desde getOrdersDb()
// 2) Aplicar filtros:
//    - status (si != 'all')
//    - q: buscar en id/customerName/customerRut (case-insensitive)
//    - from/to: issuedAt inclusivo (YYYY-MM-DD)
// 3) Mapear a OrderRow calculando vat/total con calcTotals()
// 4) Ordenar por issuedAt o total + dir asc/desc
// 5) Armar summary:
//    - count
//    - totalNet, totalVat, totalGross
//    - byStatus: conteo por cada estado

  const { q, status, from, to, sort = "issuedAt", dir = "desc" } = _q;
  const db = getOrdersDb();

  const filtrado = db.filter((orden) => {
    if (status && status !== "all" && orden.status !== status) return false;
    if (q) {
      const busqueda = q.toUpperCase();
      const match =
        orden.id.toUpperCase().includes(busqueda) ||
        orden.customerName.toUpperCase().includes(busqueda) ||
        orden.customerRut.toUpperCase().includes(busqueda);
      if (!match) return false;
    }

    const fechaOrden = orden.issuedAt.split("T")[0];
    if (from && fechaOrden < from) return false;
    if (to && fechaOrden > to) return false;

    return true;
  });

  const rows: OrderRow[] = filtrado.map((order) => {
    // Asumiendo que calcTotals devuelve { net, vat, total } basándose en order.items
    const totals = calcTotals(order);
    const net = order.net
    return {
      id: order.id,
      customerName: order.customerName,
      customerRut: order.customerRut,
      issuedAt: order.issuedAt,
      status: order.status,
      net,
      ...totals,
    };
  });

  rows.sort((a, b) => {
    const valA = a[sort];
    const valB = b[sort];

    if (valA < valB) return dir === "asc" ? -1 : 1;
    if (valA > valB) return dir === "asc" ? 1 : -1;
    return 0;
  });
//   return {
//     data: [],
//     summary: {
//       count: 0,
//       totalNet: 0,
//       totalVat: 0,
//       totalGross: 0,
//       byStatus: { pending: 0, paid: 0, canceled: 0 },
//     },
//   };
// }

  const summary = rows.reduce(
    (acc, row) => {
      acc.totalNet += row.net;
      acc.totalVat += row.vat;
      acc.totalGross += row.total;
      acc.byStatus[row.status]++;
      return acc;
    },
    {
      count: rows.length,
      totalNet: 0,
      totalVat: 0,
      totalGross: 0,
      byStatus: { pending: 0, paid: 0, canceled: 0 },
    }
  );

  return {
    data: rows,
    summary,
  };
}







export async function payOrder(
  id: string
): Promise<{ ok: true; order: Order } | { ok: false; code: number; error: string }> {
  const db = getOrdersDb();
  const cleanId = String(id).trim();

  const idx = db.findIndex((o) => String(o.id).trim() === cleanId);
  if (idx === -1) return { ok: false, code: 404, error: "Not found" };
  if (db[idx].status === "canceled") return { ok: false, code: 409, error: "Cannot pay a canceled order" };

  db[idx] = { ...db[idx], status: "paid" };
  return { ok: true, order: db[idx] };
}
