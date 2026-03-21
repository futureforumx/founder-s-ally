import { useState, useEffect, useMemo, useCallback } from "react";

// ── JSON Schema Types ──
export interface VCFirm {
  id: string;
  name: string;
  description: string | null;
  aum: string | null;
  sweet_spot: string | null;
  stages: string[] | null;
  sectors: string[] | null;
}

export interface VCPerson {
  id: string;
  firm_id: string;
  full_name: string;
  title: string | null;
  email: string | null;
}

interface VCData {
  firms: VCFirm[];
  people: VCPerson[];
}

// ── Singleton Cache ──
let cachedData: VCData | null = null;
let loadingPromise: Promise<VCData> | null = null;

async function loadVCData(): Promise<VCData> {
  if (cachedData) return cachedData;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch("/data/vc_mdm_output.json")
    .then((r) => r.json())
    .then((d: VCData) => {
      cachedData = d;
      return d;
    });
  return loadingPromise;
}

export function useVCDirectory() {
  const [data, setData] = useState<VCData | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);

  useEffect(() => {
    if (cachedData) { setData(cachedData); setLoading(false); return; }
    loadVCData().then((d) => { setData(d); setLoading(false); });
  }, []);

  const firmMap = useMemo(() => {
    if (!data) return new Map<string, VCFirm>();
    const m = new Map<string, VCFirm>();
    for (const f of data.firms) m.set(f.id, f);
    return m;
  }, [data]);

  const peopleByFirm = useMemo(() => {
    if (!data) return new Map<string, VCPerson[]>();
    const m = new Map<string, VCPerson[]>();
    for (const p of data.people) {
      const arr = m.get(p.firm_id) || [];
      arr.push(p);
      m.set(p.firm_id, arr);
    }
    return m;
  }, [data]);

  const getFirmById = useCallback((id: string) => firmMap.get(id) || null, [firmMap]);
  const getPersonById = useCallback((id: string) => data?.people.find((p) => p.id === id) || null, [data]);
  const getPartnersForFirm = useCallback((firmId: string) => peopleByFirm.get(firmId) || [], [peopleByFirm]);
  const getFirmForPerson = useCallback((personId: string) => {
    const person = data?.people.find((p) => p.id === personId);
    return person ? firmMap.get(person.firm_id) || null : null;
  }, [data, firmMap]);

  // All unique stages across firms
  const allStages = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    for (const f of data.firms) f.stages?.forEach((st) => s.add(st));
    return Array.from(s).sort();
  }, [data]);

  // All unique sectors
  const allSectors = useMemo(() => {
    if (!data) return [] as string[];
    const s = new Set<string>();
    for (const f of data.firms) f.sectors?.forEach((sc) => s.add(sc));
    return Array.from(s).sort();
  }, [data]);

  return {
    firms: data?.firms || [],
    people: data?.people || [],
    loading,
    firmMap,
    peopleByFirm,
    getFirmById,
    getPersonById,
    getPartnersForFirm,
    getFirmForPerson,
    allStages,
    allSectors,
  };
}
