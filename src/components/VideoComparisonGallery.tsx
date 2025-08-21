// src/components/VideoComparisonGallery.tsx
import React, { useState, useRef, useEffect } from 'react';
import { ReactCompareSlider } from 'react-compare-slider';
import { Play, Pause } from 'lucide-react';

export interface ComparisonItem {
  thumbnailSrc: string;
  videoSrcOne: string;
  videoSrcTwo: string;
  altText?: string;
}

interface VideoComparisonGalleryProps {
  comparisonData: ComparisonItem[];
}

export const VideoComparisonGallery: React.FC<VideoComparisonGalleryProps> = ({ comparisonData }) => {
  console.log('VideoComparisonGallery rendered!', comparisonData);
  
  const data = Array.isArray(comparisonData) ? comparisonData : [];
  console.log('Processed data:', data);
  
  if (data.length === 0) {
    console.log('No data available');
    return <div style={{opacity:.7}}>No videos to compare.</div>;
  }

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false); // 초기값을 false로 변경
  const [videosLoaded, setVideosLoaded] = useState({ v1: false, v2: false });

  useEffect(() => {
    setSelectedIndex(i => Math.min(i, data.length - 1));
  }, [data.length]);

  const videoRef1 = useRef<HTMLVideoElement>(null);
  const videoRef2 = useRef<HTMLVideoElement>(null);
  const activeItem = data[selectedIndex];

  // 디버깅: 현재 비디오 소스 출력
  useEffect(() => {
    console.log('=== VideoComparisonGallery Debug Info ===');
    console.log('Selected index:', selectedIndex);
    console.log('Data length:', data.length);
    console.log('Full data:', data);
    console.log('Active item:', activeItem);
    console.log('Current video sources:', {
      videoOne: activeItem?.videoSrcOne,
      videoTwo: activeItem?.videoSrcTwo,
      thumbnail: activeItem?.thumbnailSrc
    });
    console.log('Video source types:', {
      videoOneType: typeof activeItem?.videoSrcOne,
      videoTwoType: typeof activeItem?.videoSrcTwo,
      videoOneValue: activeItem?.videoSrcOne,
      videoTwoValue: activeItem?.videoSrcTwo
    });
    console.log('Videos loaded state:', videosLoaded);
    console.log('==========================================');
  }, [activeItem, videosLoaded]);

  const handleThumbnailClick = (index: number) => {
    setSelectedIndex(index);
    setIsPlaying(false);
    setVideosLoaded({ v1: false, v2: false }); // 로딩 상태 초기화
  };

  const togglePlayPause = () => {
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    
    if (!v1 || !v2) return;
    
    if (isPlaying) {
      v1.pause();
      v2.pause();
      setIsPlaying(false);
    } else {
      // 두 비디오가 모두 로드되었을 때만 재생
      if (videosLoaded.v1 && videosLoaded.v2) {
        Promise.allSettled([v1.play(), v2.play()]).then(results => {
          const hasError = results.some(r => r.status === 'rejected');
          if (hasError) {
            console.log('Play failed:', results);
            setIsPlaying(false);
          } else {
            setIsPlaying(true);
          }
        });
      }
    }
  };

  // 비디오 로딩 감지 - 더 관대한 조건 사용
  const handleVideoLoaded = (videoNumber: 1 | 2) => {
    console.log(`Video ${videoNumber} loaded!`);
    setVideosLoaded(prev => ({
      ...prev,
      [`v${videoNumber}`]: true
    }));
  };

  // 비디오 로딩 에러 처리
  const handleVideoError = (videoNumber: 1 | 2, error: any) => {
    console.error(`Video ${videoNumber} error:`, error);
    // 에러가 발생해도 로드된 것으로 처리하여 재생 버튼 활성화
    setVideosLoaded(prev => ({
      ...prev,
      [`v${videoNumber}`]: true
    }));
  };

  // 선택 바꿀 때 상태 초기화
  useEffect(() => {
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    if (v1 && v2) { 
      v1.currentTime = 0; 
      v2.currentTime = 0; 
      v1.pause();
      v2.pause();
    }
    setIsPlaying(false);
    setVideosLoaded({ v1: false, v2: false });
  }, [selectedIndex]);

  // 시간 동기화
  useEffect(() => {
    const v1 = videoRef1.current;
    const v2 = videoRef2.current;
    if (!v1 || !v2) return;

    const SYNC_EPS = 0.12;
    const sync = () => {
      if (Math.abs(v1.currentTime - v2.currentTime) > SYNC_EPS) {
        v2.currentTime = v1.currentTime;
      }
    };
    v1.addEventListener('timeupdate', sync);
    v1.addEventListener('seeking', sync);
    return () => {
      v1.removeEventListener('timeupdate', sync);
      v1.removeEventListener('seeking', sync);
    };
  }, [selectedIndex]);



  return (
    <div>
      {/* 썸네일 */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        {data.map((item, idx) => (
          <button
            key={idx}
            onClick={() => handleThumbnailClick(idx)}
            style={{
              border:`2px solid ${selectedIndex===idx ? '#007aff' : 'transparent'}`,
              padding:2, borderRadius:8, background:'none', cursor:'pointer',
              opacity: selectedIndex===idx ? 1 : 0.7, transition:'all .2s'
            }}
            aria-label={item.altText || `Comparison ${idx+1}`}
            title={item.altText || `Comparison ${idx+1}`}
          >
            <img
              src={item.thumbnailSrc}
              alt={item.altText || `Comparison ${idx+1}`}
              style={{ width:120, height:72, objectFit:'cover', borderRadius:6, display:'block' }}
            />
          </button>
        ))}
      </div>

      {/* 슬라이더: 높이 보장을 위해 aspect-ratio */}
      <div style={{ position:'relative', width:'100%', aspectRatio:'16 / 9' }}>
        <ReactCompareSlider
          key={`comparison-${selectedIndex}`}
          position={50}
          boundsPadding={0}
          itemOne={
            <video
              ref={videoRef1}
              src={activeItem.videoSrcOne}
              poster={activeItem.thumbnailSrc}
              muted playsInline loop preload="metadata"
              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
              onLoadStart={() => console.log('Video 1 load started')}
              onLoadedMetadata={() => {
                console.log('Video 1 metadata loaded:', activeItem.videoSrcOne);
                handleVideoLoaded(1);
              }}
              onCanPlay={() => {
                console.log('Video 1 can play');
                handleVideoLoaded(1);
              }}
              onError={(e) => {
                console.error('Video 1 error:', e.currentTarget.error, activeItem.videoSrcOne);
                handleVideoError(1, e.currentTarget.error);
              }}
            />
          }
          itemTwo={
            <video
              ref={videoRef2}
              src={activeItem.videoSrcTwo}
              poster={activeItem.thumbnailSrc}
              muted playsInline loop preload="metadata"
              style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
              onLoadStart={() => console.log('Video 2 load started')}
              onLoadedMetadata={() => {
                console.log('Video 2 metadata loaded:', activeItem.videoSrcTwo);
                handleVideoLoaded(2);
              }}
              onCanPlay={() => {
                console.log('Video 2 can play');
                handleVideoLoaded(2);
              }}
              onError={(e) => {
                console.error('Video 2 error:', e.currentTarget.error, activeItem.videoSrcTwo);
                handleVideoError(2, e.currentTarget.error);
              }}
            />
          }
          style={{ width:'100%', height:'100%', borderRadius:'0.5rem' }}
        />

        {/* 재생/정지 */}
        <button
          onClick={togglePlayPause}
          style={{
            position:'absolute', bottom:'1rem', left:'50%', transform:'translateX(-50%)',
            backgroundColor:'rgba(0,0,0,.6)', color:'#fff', border:'none',
            borderRadius:'50%', width:48, height:48, display:'flex',
            alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:30,
            backdropFilter:'blur(2px)',
            opacity: videosLoaded.v1 && videosLoaded.v2 ? 1 : 0.5
          }}
          aria-label={isPlaying ? 'Pause comparison videos' : 'Play comparison videos'}
          title={isPlaying ? 'Pause' : 'Play'}
          disabled={!(videosLoaded.v1 && videosLoaded.v2)}
        >
          {isPlaying ? <Pause size={24} /> : <Play size={24} />}
        </button>
        
        {/* 로딩 상태 표시 */}
        {(!videosLoaded.v1 || !videosLoaded.v2) && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '5px',
            fontSize: '14px'
          }}>
            Loading videos... ({videosLoaded.v1 ? '1' : '0'}/2)
          </div>
        )}
      </div>
    </div>
  );
};
