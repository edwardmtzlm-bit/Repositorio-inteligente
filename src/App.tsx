import { AppErrorBoundary } from './components/AppErrorBoundary';
import { KnowledgeRepositoryPage } from './pages/KnowledgeRepositoryPage';

export default function App() {
  return (
    <AppErrorBoundary>
      <KnowledgeRepositoryPage />
    </AppErrorBoundary>
  );
}
