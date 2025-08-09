'use client';
import dynamic from 'next/dynamic';

const MindfulFractals = dynamic(() => import('@/components/MindfulFractals'), { ssr: false });

export default function Page() {
  return <MindfulFractals />;
}
