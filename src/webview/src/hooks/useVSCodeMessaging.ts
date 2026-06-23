import { useEffect, useCallback, useRef } from 'react';
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from '../../../types/webview';

interface VSCodeApi {
  postMessage(message: WebviewToExtensionMessage): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VSCodeApi;

let vscodeApi: VSCodeApi | undefined;

function getVSCodeApi(): VSCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi();
  }
  return vscodeApi;
}

type MessageHandler = (message: ExtensionToWebviewMessage) => void;

export function useVSCodeMessaging(onMessage: MessageHandler) {
  const handlerRef = useRef<MessageHandler>(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data as ExtensionToWebviewMessage;
      handlerRef.current(message);
    };
    window.addEventListener('message', handler);

    // Notify extension that webview is ready
    getVSCodeApi().postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', handler);
  }, []);

  const postMessage = useCallback((message: WebviewToExtensionMessage) => {
    getVSCodeApi().postMessage(message);
  }, []);

  const getState = useCallback(<T,>(): T | undefined => {
    return getVSCodeApi().getState<T>();
  }, []);

  const setState = useCallback(<T,>(state: T): void => {
    getVSCodeApi().setState(state);
  }, []);

  return { postMessage, getState, setState };
}
