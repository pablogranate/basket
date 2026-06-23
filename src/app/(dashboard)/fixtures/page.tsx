import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SectionPageHeader } from "@/components/layout/section-page-header";

type Fixture = {
  id: string;
  competition: string | null;
  category: string | null;
  phase: string | null;
  group: string | null;
  home_club: string | null;
  home_team: string | null;
  away_club: string | null;
  away_team: string | null;
  suspended: boolean;
  home_points: number | null;
  away_points: number | null;
  match_date: string | null;
  match_time: string | null;
  venue: string | null;
  court: string | null;
  city: string | null;
  province: string | null;
  synced_at: string;
};

export default async function FixturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const category = (params.category as string) || "";

  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from("fixtures")
    .select("*")
    .order("match_date", { ascending: true })
    .order("match_time", { ascending: true });

  const { data: fixtures } = await (category ? query.ilike("category", `%${category}%`) : query)
    .returns<Fixture[]>();

  const categories = await supabase
    .from("fixtures")
    .select("category")
    .order("category")
    .returns<{ category: string | null }[]>();

  const uniqueCategories = [
    ...new Set((categories.data || []).map((r) => r.category).filter(Boolean)),
  ];

  const grouped = (fixtures || []).reduce<Record<string, Fixture[]>>((acc, f) => {
    const key = f.match_date || "Sin fecha";
    if (!acc[key]) acc[key] = [];
    acc[key]!.push(f);
    return acc;
  }, {});

  const formatDate = (d: string) => {
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="p-6 space-y-6">
      <SectionPageHeader title="Fixtures" description="Partidos por categoría" />

      {/* Filtro de categoría */}
      <div className="flex gap-2 flex-wrap">
        <a
          href="/fixtures"
          className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
            !category ? "bg-blue-600 text-white border-blue-600" : "border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Todas
        </a>
        {uniqueCategories.map((cat) => (
          <a
            key={cat}
            href={`/fixtures?category=${encodeURIComponent(cat!)}`}
            className={`px-3 py-1 rounded-full text-sm font-medium border transition-colors ${
              cat === category
                ? "bg-blue-600 text-white border-blue-600"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {cat}
          </a>
        ))}
      </div>

      {/* Tabla por fecha */}
      {Object.keys(grouped).length === 0 ? (
        <p className="text-gray-500 text-sm">
          No hay fixtures cargados para esta categoría. Ejecutá el script de sync.
        </p>
      ) : (
        Object.entries(grouped).map(([date, matches]) => (
          <div key={date}>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              {date === "Sin fecha" ? "Sin fecha" : formatDate(date)}
            </h2>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2 text-left">Hora</th>
                    <th className="px-4 py-2 text-left">Local</th>
                    <th className="px-4 py-2 text-center">vs</th>
                    <th className="px-4 py-2 text-left">Visitante</th>
                    <th className="px-4 py-2 text-left">Fase / Grupo</th>
                    <th className="px-4 py-2 text-left">Sede</th>
                    <th className="px-4 py-2 text-left">Ciudad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(matches || []).map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                        {f.match_time?.slice(0, 5) || "—"}
                      </td>
                      <td className="px-4 py-2 font-medium">{f.home_team || f.home_club}</td>
                      <td className="px-4 py-2 text-center text-gray-400">
                        {f.home_points != null && f.away_points != null
                          ? `${f.home_points} - ${f.away_points}`
                          : "vs"}
                      </td>
                      <td className="px-4 py-2 font-medium">{f.away_team || f.away_club}</td>
                      <td className="px-4 py-2 text-gray-500">
                        {[f.phase, f.group].filter(Boolean).join(" / ") || "—"}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{f.venue || "—"}</td>
                      <td className="px-4 py-2 text-gray-500">{f.city || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}

      <p className="text-xs text-gray-400">
        Última sincronización:{" "}
        {fixtures?.[0]?.synced_at
          ? new Date(fixtures[0].synced_at).toLocaleString("es-AR")
          : "nunca"}
      </p>
    </div>
  );
}
