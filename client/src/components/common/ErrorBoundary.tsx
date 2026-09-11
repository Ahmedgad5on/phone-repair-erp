import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught React Error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-100">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-6 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 border border-rose-500/30">
              <AlertOctagon className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold mb-2">عفواً، حدث خطأ غير متوقع</h2>
            <p className="text-xs text-slate-400 mb-6">
              تم حماية النظام من الانهيار الكلي عبر Error Boundary. يمكنك إعادة تحميل الصفحة للمتابعة.
            </p>
            {this.state.error && (
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-rose-400 text-[11px] text-left overflow-auto max-h-32 mb-6">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              إعادة تحميل الصفحة (Reload)
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
