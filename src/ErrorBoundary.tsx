import React, { Component, ErrorInfo, ReactNode } from 'react';

class ErrorBoundary extends Component<any, any> {
  // @ts-ignore
  constructor(props) {
    super(props);
    // @ts-ignore
    this.state = {
      hasError: false,
      errorMsg: ''
    };
  }

  // @ts-ignore
  static getDerivedStateFromError(error) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error && parsed.operationType) {
        return { hasError: true, errorMsg: "Database Permission Error: Make sure your Firebase Security Rules are correctly published." };
      }
    } catch (e) {
      // Not a JSON error
    }
    return { hasError: true, errorMsg: error.message || "An unexpected error occurred." };
  }

  // @ts-ignore
  componentDidCatch(error, errorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  // @ts-ignore
  render() {
    // @ts-ignore
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-dark-bg text-white flex items-center justify-center p-4 font-sans">
          <div className="bg-card-bg border border-red-500 p-8 max-w-md w-full shadow-2xl">
            <h2 className="text-red-500 text-xl font-bold uppercase mb-4 tracking-widest">Application Error</h2>
            <p className="text-text-dim text-sm mb-6 uppercase tracking-wider leading-relaxed">
              {/* @ts-ignore */}
              {this.state.errorMsg}
            </p>
            <button
              className="w-full bg-red-500/10 text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white transition-all py-3 font-bold uppercase tracking-widest text-[10px]"
              onClick={() => { window.location.reload(); }}
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}

export default ErrorBoundary;
