import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getActiveBranchId, getStoredBranches, setActiveBranchId, setStoredBranches } from '../api.js';
import { useAuth } from './AuthContext.jsx';

const BranchContext = createContext(null);

export function BranchProvider({ children }) {
  const { user, isOwner } = useAuth();
  const cachedBranches = useMemo(() => getStoredBranches(), []);
  const [branches, setBranches] = useState(cachedBranches);
  const [activeBranchId, setActiveBranchState] = useState(() => getActiveBranchId());
  const [loading, setLoading] = useState(() => !(cachedBranches.length && getActiveBranchId()));
  const [revision, setRevision] = useState(0);

  const applyRows = useCallback((rows) => {
    setBranches(rows);
    setStoredBranches(rows);
    const activeRows = rows.filter((branch) => Number(branch.is_active ?? 1) !== 0);
    const preferredId = isOwner ? getActiveBranchId() : (user?.branch_id || getActiveBranchId());
    const preferred = activeRows.find((branch) => branch.id === preferredId);
    const fallback = preferred || activeRows.find((branch) => Number(branch.is_default || 0) === 1) || activeRows[0] || rows[0];
    const nextId = fallback?.id || '';
    setActiveBranchState(nextId);
    setActiveBranchId(nextId);
    return rows;
  }, [isOwner, user?.branch_id]);

  const refreshBranches = useCallback(async (silent = false) => {
    if (!user) {
      setBranches([]);
      setStoredBranches([]);
      setLoading(false);
      return [];
    }
    if (!silent) setLoading(true);
    try {
      const res = await api.branches();
      return applyRows(res.data || []);
    } catch (error) {
      // Keep a valid cached branch visible during a temporary Render/Mongo cold start.
      if (!branches.length) throw error;
      console.warn('[branches] background refresh failed; using cache', error.code || error.status);
      return branches;
    } finally {
      if (!silent) setLoading(false);
    }
  }, [applyRows, branches, user]);

  useEffect(() => {
    const hasCache = branches.length > 0 && Boolean(activeBranchId);
    refreshBranches(hasCache).catch((error) => console.warn('[branches] initial load failed', error.code || error.status));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, isOwner]);

  const selectBranch = useCallback((branchId) => {
    const nextId = String(branchId || '');
    if (!nextId) return;
    const target = branches.find((branch) => branch.id === nextId);
    if (target && Number(target.is_active ?? 1) === 0) return;
    setActiveBranchId(nextId);
    setActiveBranchState(nextId);
    setRevision((value) => value + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [branches]);

  const activeBranch = useMemo(
    () => branches.find((branch) => branch.id === activeBranchId) || branches.find((branch) => Number(branch.is_active ?? 1) !== 0) || null,
    [activeBranchId, branches],
  );

  const value = useMemo(() => ({
    branches,
    activeBranches: branches.filter((branch) => Number(branch.is_active ?? 1) !== 0),
    activeBranch,
    activeBranchId,
    selectBranch,
    refreshBranches,
    loading,
    revision,
  }), [activeBranch, activeBranchId, branches, loading, refreshBranches, revision, selectBranch]);

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>;
}

export function useBranch() {
  const value = useContext(BranchContext);
  if (!value) throw new Error('useBranch must be used inside BranchProvider');
  return value;
}
