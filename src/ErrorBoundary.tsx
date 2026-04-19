import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught runtime error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] bg-[#0A0F0B] text-white flex flex-col items-center justify-center p-6 text-center font-sans">
          <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-[#C2FF00] tracking-widest uppercase mb-2">System Interruption</h1>
          <p className="text-gray-400 text-sm max-w-sm mb-8 leading-relaxed">
            A temporary component error occurred. We've paused the interface to prevent data loss.
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="bg-[#C2FF00] text-black px-10 py-4 rounded-2xl font-black uppercase text-xs tracking-[2px] shadow-[0_0_20px_rgba(194,255,0,0.2)] hover:scale-105 transition-all"
          >
            Reboot Interface
          </button>
        </div>
      );
    }

    return (this as any).props.children;
  }
}
