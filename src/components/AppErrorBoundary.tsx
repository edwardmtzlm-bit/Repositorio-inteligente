import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('App runtime error:', error, errorInfo);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-slate-50 px-6 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-[2rem] border border-red-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">Error de interfaz</p>
          <h1 className="mt-3 text-2xl font-semibold">La aplicación encontró un error al renderizar.</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Esto reemplaza la pantalla blanca para mostrar el fallo real. Si me compartes este mensaje, puedo corregir la causa exacta.
          </p>
          <pre className="mt-6 overflow-x-auto rounded-2xl bg-slate-950 p-4 text-sm leading-6 text-slate-100">
            {this.state.error.stack || this.state.error.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }
}
