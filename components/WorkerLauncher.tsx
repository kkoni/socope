import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { currentNeighborCrawlStatusState } from '../states';
import { startWorkers, stopWorkers } from '../model/worker/worker';

export default function WorkerLauncher() {
  const [ _, setCurrentNeighborCrawlStatus ] = useRecoilState(currentNeighborCrawlStatusState);

  useEffect(() => {
    startWorkers(setCurrentNeighborCrawlStatus);
    return stopWorkers;
  }, []);
}
