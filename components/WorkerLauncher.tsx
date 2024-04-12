import { useRecoilState } from 'recoil';
import { View } from 'react-native';
import { currentNeighborCrawlStatusState } from '../states';
import { startWorkers } from '../model/worker/worker';

export default function WorkerLauncher() {
  const [ _, setCurrentNeighborCrawlStatus ] = useRecoilState(currentNeighborCrawlStatusState);
  startWorkers(setCurrentNeighborCrawlStatus);
}
