import { useState, useEffect, useCallback } from 'react';
import { workflowEngineApi, type AvailableTransitionsResponse } from '../api/workflow-engine';

export function useIssueTransitions(issueId: string) {
  const [data, setData] = useState<AvailableTransitionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await workflowEngineApi.getTransitions(issueId);
      setData(result);
    } catch (e) {
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [issueId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { currentStatus: data?.currentStatus ?? null, transitions: data?.transitions ?? [], isLoading, error, refetch };
}
