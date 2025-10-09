import { useState, useCallback, useRef } from 'react';

interface OptimisticUpdate<T> {
  id: string;
  data: T;
  rollback: T;
}

export function useOptimisticUpdate<T extends { id?: string }>() {
  const [updates, setUpdates] = useState<Map<string, OptimisticUpdate<T>>>(new Map());
  const rollbackTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const applyOptimistic = useCallback((id: string, data: T, rollback: T, timeout = 30000) => {
    setUpdates(prev => {
      const newUpdates = new Map(prev);
      newUpdates.set(id, { id, data, rollback });
      return newUpdates;
    });

    const existingTimer = rollbackTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      setUpdates(prev => {
        const newUpdates = new Map(prev);
        newUpdates.delete(id);
        return newUpdates;
      });
      
      const timerToDelete = rollbackTimersRef.current.get(id);
      if (timerToDelete) {
        rollbackTimersRef.current.delete(id);
      }
    }, timeout);

    rollbackTimersRef.current.set(id, timer);

    return id;
  }, []);

  const commitUpdate = useCallback((id: string) => {
    setUpdates(prev => {
      const newUpdates = new Map(prev);
      newUpdates.delete(id);
      return newUpdates;
    });

    const timer = rollbackTimersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      rollbackTimersRef.current.delete(id);
    }
  }, []);

  const rollbackUpdate = useCallback((id: string) => {
    setUpdates(prev => {
      const update = prev.get(id);
      if (!update) return prev;

      const newUpdates = new Map(prev);
      newUpdates.delete(id);
      
      const timer = rollbackTimersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        rollbackTimersRef.current.delete(id);
      }

      return newUpdates;
    });
  }, []);

  const getOptimisticData = useCallback((originalData: T[], idKey: keyof T = 'id' as keyof T): T[] => {
    const result = [...originalData];

    updates.forEach((update) => {
      const index = result.findIndex(item => item[idKey] === update.data[idKey]);
      if (index !== -1) {
        result[index] = update.data;
      } else {
        result.push(update.data);
      }
    });

    return result;
  }, [updates]);

  return {
    applyOptimistic,
    commitUpdate,
    rollbackUpdate,
    getOptimisticData,
    hasUpdates: updates.size > 0
  };
}
