import { useEffect, useRef, type RefObject } from 'react';
import { drawPose } from '../lib/pose/drawPose';
import type { PoseFrame } from '../types/pose';

interface PoseCanvasProps {
  poseFrame: PoseFrame | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  mirror: boolean;
}

export function PoseCanvas({ poseFrame, videoRef, mirror }: PoseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }

    drawPose(canvas, poseFrame, video.videoWidth, video.videoHeight, { mirror });
  }, [poseFrame, videoRef, mirror]);

  return <canvas ref={canvasRef} className="pose-canvas" aria-hidden="true" />;
}
