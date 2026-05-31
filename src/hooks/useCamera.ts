import { useCallback, useEffect, useRef, useState } from 'react';
import { squatConfig } from '../lib/config/squatConfig';

type CameraStatus = 'idle' | 'requesting' | 'ready' | 'error';

export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);
  const attachedVideoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (attachedVideoRef.current) {
      attachedVideoRef.current.srcObject = null;
    }
    setStatus('idle');
  }, []);

  const startCamera = useCallback(
    async (videoElement: HTMLVideoElement | null) => {
      if (!videoElement) {
        setError('비디오 요소를 찾을 수 없습니다.');
        setStatus('error');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('이 브라우저에서는 웹캠 접근을 지원하지 않습니다.');
        setStatus('error');
        return;
      }

      try {
        stopCamera();
        setError(null);
        setStatus('requesting');

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: squatConfig.camera.width },
            height: { ideal: squatConfig.camera.height },
            facingMode: 'user',
          },
          audio: false,
        });

        streamRef.current = stream;
        attachedVideoRef.current = videoElement;
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            if (streamRef.current === stream) {
              streamRef.current = null;
              setStatus('idle');
            }
          });
        });
        videoElement.srcObject = stream;
        await videoElement.play();
        setStatus('ready');
      } catch (caughtError) {
        const message =
          caughtError instanceof DOMException && caughtError.name === 'NotAllowedError'
            ? '카메라 권한이 거부되었습니다. 브라우저 권한 설정을 확인해 주세요.'
            : '카메라를 시작하지 못했습니다. 다른 앱이 카메라를 사용 중인지 확인해 주세요.';
        setError(message);
        setStatus('error');
      }
    },
    [stopCamera],
  );

  useEffect(() => stopCamera, [stopCamera]);

  return {
    status,
    error,
    stream: streamRef.current,
    isReady: status === 'ready',
    startCamera,
    stopCamera,
  };
}
