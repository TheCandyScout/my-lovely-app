'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import { ReactCompareSlider } from 'react-compare-slider';
import { debounce } from 'lodash';
import Konva from 'konva';

// Define proper types for the application
interface Position {
  x: number;
  y: number;
}

interface Dimensions {
  width: number;
  height: number;
}

interface MagnifyParams {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  sourceWidth: number;
  sourceHeight: number;
  centerX: number;
  centerY: number;
}

interface ImageLoaderResult {
  image: HTMLImageElement | null;
  dimensions: Dimensions | null;
  loading: boolean;
  error: string | null;
}

interface MagnifiedViewContentProps {
  image: HTMLImageElement;
  params: MagnifyParams;
  width: number;
  height: number;
}

interface MagnifiedViewProps {
  image: HTMLImageElement | null;
  referenceImage: HTMLImageElement | null;
  magnifierPosition: Position;
  stageDimensions: Dimensions;
  magDimensions: Dimensions;
  zoomScale: number;
  loading: boolean;
}

interface MainImageViewProps {
  image: HTMLImageElement | null;
  loading: boolean;
  stageDimensions: Dimensions;
  showRectangle: boolean;
  magnifierPosition: Position;
  lensSize: Dimensions;
  onMouseMove: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  onTouchMove: (e: Konva.KonvaEventObject<TouchEvent>) => void;
  onClick: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
}

// Custom hook for image loading with error handling
const useImageLoader = (imageUrl: string): ImageLoaderResult => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimensions | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setLoading(false);
      setError("No image URL provided");
      return;
    }

    const img = new window.Image();
    img.crossOrigin = "anonymous";
    
    // Set up handlers before setting src
    img.onload = () => {
      setImage(img);
      setDimensions({
        width: img.naturalWidth || 600,
        height: img.naturalHeight || 400
      });
      setLoading(false);
    };
    
    img.onerror = (e) => {
      console.error("Image load error:", e);
      setError("Failed to load image");
      setLoading(false);
    };
    
    img.src = imageUrl;
    
    return () => {
      // Cancel the image load if component unmounts
      img.onload = null;
      img.onerror = null;
    };
  }, [imageUrl]);

  return { image, dimensions, loading, error };
};

// Optimized function to calculate magnification parameters
const getMagnifyParams = (
  image: HTMLImageElement, 
  referenceImage: HTMLImageElement | null, 
  magnifierPosition: Position, 
  stageDimensions: Dimensions, 
  magDimensions: Dimensions, 
  zoomScale: number
): MagnifyParams | null => {
  if (!image) return null;
  
  // Use safe values with defaults and guard against NaN
  const safeZoomScale = zoomScale || 0.5;
  const safeStageWidth = stageDimensions?.width || 400;
  const safeStageHeight = stageDimensions?.height || 300;
  const safeMagWidth = magDimensions?.width || 400;
  const safeMagHeight = magDimensions?.height || 400;
  
  const referenceWidth = referenceImage ? referenceImage.width : image.width;
  const referenceHeight = referenceImage ? referenceImage.height : image.height;
  
  // Calculate the magnified area's center point
  const centerX = magnifierPosition.x / (safeStageWidth / referenceWidth);
  const centerY = magnifierPosition.y / (safeStageHeight / referenceHeight);
  
  // Calculate source dimensions
  const sourceWidth = safeMagWidth / safeZoomScale;
  const sourceHeight = safeMagHeight / safeZoomScale;
  
  // Calculate source position (constrained to image boundaries)
  const sourceX = Math.max(0, Math.min(centerX - (sourceWidth / 2), referenceWidth - sourceWidth));
  const sourceY = Math.max(0, Math.min(centerY - (sourceHeight / 2), referenceHeight - sourceHeight));
  
  // Scale for different sized images
  let finalSourceX = sourceX;
  let finalSourceY = sourceY;
  let scaleFactorX = safeZoomScale;
  let scaleFactorY = safeZoomScale;
  
  if (referenceImage && image !== referenceImage) {
    const scaleX = image.width / referenceWidth;
    const scaleY = image.height / referenceHeight;
    finalSourceX = sourceX * scaleX;
    finalSourceY = sourceY * scaleY;
    scaleFactorX = safeZoomScale / scaleX;
    scaleFactorY = safeZoomScale / scaleY;
  }
  
  return {
    x: finalSourceX,
    y: finalSourceY,
    scaleX: scaleFactorX,
    scaleY: scaleFactorY,
    sourceWidth,
    sourceHeight,
    centerX,
    centerY
  };
};

// Optimized MagnifiedView inner content with React.memo and display name
const MagnifiedViewContent = React.memo(({ image, params, width, height }: MagnifiedViewContentProps) => (
  <Stage 
    width={width}
    height={height}
    style={{ width: '100%', height: '100%', display: 'block' }}
  >
    <Layer>
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        fillPatternImage={image}
        fillPatternScale={{ x: params.scaleX, y: params.scaleY }}
        fillPatternOffset={{ x: params.x, y: params.y }}
      />
    </Layer>
  </Stage>
), (prevProps, nextProps) => {
  // Custom comparison function to prevent unnecessary renders
  return prevProps.image === nextProps.image && 
         prevProps.width === nextProps.width &&
         prevProps.height === nextProps.height &&
         prevProps.params.x === nextProps.params.x &&
         prevProps.params.y === nextProps.params.y &&
         prevProps.params.scaleX === nextProps.params.scaleX &&
         prevProps.params.scaleY === nextProps.params.scaleY;
});

// Add display name to fix the react/display-name error
MagnifiedViewContent.displayName = 'MagnifiedViewContent';

// Optimized MagnifiedView component
const MagnifiedView = ({ 
  image, 
  referenceImage, 
  magnifierPosition, 
  stageDimensions, 
  magDimensions, 
  zoomScale, 
  loading 
}: MagnifiedViewProps) => {
  const stageRef = useRef<Konva.Stage | null>(null);
  
  // Calculate parameters for magnification
  const params = useMemo(() => {
    if (!image) return null;
    
    return getMagnifyParams(
      image, 
      referenceImage, 
      magnifierPosition, 
      stageDimensions, 
      magDimensions || { width: 400, height: 400 }, 
      zoomScale || 0.5
    );
  }, [image, referenceImage, magnifierPosition, stageDimensions, magDimensions, zoomScale]);
  
  // Cleanup Konva resources - fixed exhaustive-deps warning
  useEffect(() => {
    // Store the current ref value
    const currentStageRef = stageRef.current;
    
    return () => {
      if (currentStageRef) {
        if (currentStageRef.destroyChildren) {
          currentStageRef.destroyChildren();
          currentStageRef.destroy();
        }
      }
    };
  }, []);
  
  // Loading state
  if (loading || !image || !params) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: '#f5f5f5',
        borderRadius: '8px'
      }}>
        <div className="loader">Loading...</div>
      </div>
    );
  }
  
  const width = magDimensions?.width || 400;
  const height = magDimensions?.height || 400;
  
  return <MagnifiedViewContent 
    image={image} 
    params={params} 
    width={width} 
    height={height} 
  />;
};

// Add display name to fix the react/display-name error
MagnifiedView.displayName = 'MagnifiedView';

// Optimized MainImageView component with displayName
const MainImageView = React.memo(({
  image,
  loading,
  stageDimensions,
  showRectangle,
  magnifierPosition,
  lensSize,
  onMouseMove,
  onTouchMove,
  onClick
}: MainImageViewProps) => {
  // Loading state with placeholder
  if (loading || !image) {
    return (
      <div style={{ 
        width: '100%', 
        paddingBottom: '135.333%',
        position: 'relative',
        border: '1px solid #ccc',
        borderRadius: '8px',
        backgroundColor: '#f5f5f5',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center'
      }}>
        <div className="loader">Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ 
      width: '100%', 
      paddingBottom: `${(stageDimensions.height / stageDimensions.width * 100)}%`,
      position: 'relative',
      border: '1px solid #ccc',
      borderRadius: '8px',
      overflow: 'hidden'
    }}>
      <Stage
        width={stageDimensions.width}
        height={stageDimensions.height}
        onClick={onClick}
        onTouchStart={onClick}
        onMouseMove={onMouseMove}
        onTouchMove={onTouchMove}
        style={{ 
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          borderRadius: '8px'
        }}
      >
        <Layer>
          <KonvaImage
            image={image}
            x={0}
            y={0}
            width={stageDimensions.width}
            height={stageDimensions.height}
          />
          {showRectangle && (
            <Rect
              x={magnifierPosition.x - (lensSize.width / 2)}
              y={magnifierPosition.y - (lensSize.height / 2)}
              width={lensSize.width}
              height={lensSize.height}
              stroke="red"
              strokeWidth={2}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
});

// Add display name to fix the react/display-name error
MainImageView.displayName = 'MainImageView';

// Main component
export default function Home() {
  const imageUrl1 = '/my-lovely-app/images/source.jpg';
  const imageUrl2 = '/my-lovely-app/images/source-1.png';

  // Use custom hook for image loading
  const { 
    image: image1, 
    dimensions: imageDimensions, 
    loading: loading1,
    error: error1
  } = useImageLoader(imageUrl1);
  
  const { 
    image: image2, 
    loading: loading2,
    error: error2
  } = useImageLoader(imageUrl2);

  // Split state for better performance
  const [magnifierPosition, setMagnifierPosition] = useState<Position>({ x: 0, y: 0 });
  const [showLens, setShowLens] = useState<boolean>(false);
  const [showRectangle, setShowRectangle] = useState<boolean>(false);
  const [stageDimensions, setStageDimensions] = useState<Dimensions>({ width: 400, height: 300 });
  const [magDimensions] = useState<Dimensions>({ width: 400, height: 400 });
  const [compareHeight] = useState<number>(400);
  const [zoomScale] = useState<number>(0.5);

  // Refs with proper types
  const stageRef = useRef<HTMLDivElement | null>(null);
  const compareRef = useRef<HTMLDivElement | null>(null);
  const magnifyRef = useRef<HTMLDivElement | null>(null);
  const compareStage1Ref = useRef<HTMLDivElement | null>(null);
  const compareStage2Ref = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // Set initial magnifier position when image loads
  useEffect(() => {
    if (image1 && !loading1) {
      setMagnifierPosition({
        x: stageDimensions.width / 2,
        y: stageDimensions.height / 2
      });
    }
  }, [image1, loading1, stageDimensions.width, stageDimensions.height]);

  // Handle resizing - optimized with useCallback
  const updateDimensions = useCallback(() => {
    if (!stageRef.current || !imageDimensions) return;
    
    const containerWidth = stageRef.current.offsetWidth || 400;
    const imgWidth = imageDimensions.width || 600;
    const imgHeight = imageDimensions.height || 400;
    
    // Calculate height based on aspect ratio
    const stageHeight = Math.floor((containerWidth * imgHeight) / imgWidth) || 300;
    
    setStageDimensions({ width: containerWidth, height: stageHeight });
  }, [imageDimensions]);

  // Set up resize observer - fixed exhaustive-deps warning
  useEffect(() => {
    if (image1 && !loading1 && imageDimensions && stageRef.current) {
      // Create debounced resize function
      const debouncedResize = debounce(updateDimensions, 150);
      
      // Store the ref value
      const currentStageRef = stageRef.current;
      
      // Setup ResizeObserver
      const observer = new ResizeObserver(debouncedResize);
      resizeObserverRef.current = observer;
      observer.observe(currentStageRef);
      
      // Initial dimensions calculation
      updateDimensions();
      
      return () => {
        if (observer) {
          observer.disconnect();
        }
      };
    }
  }, [image1, loading1, imageDimensions, updateDimensions]);

  // Optimized event handlers
  const handleMouseMove = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!showLens) return;
    
    const stage = e.target.getStage();
    const pointerPosition = stage?.getPointerPosition();
    if (pointerPosition) {
      setMagnifierPosition(pointerPosition);
    }
  }, [showLens]);

  const handleTouchMove = useCallback((e: Konva.KonvaEventObject<TouchEvent>) => {
    if (!showLens) return;
    
    e.evt.preventDefault();
    const touchPosition = e.target.getStage()?.getPointerPosition();
    if (touchPosition) {
      setMagnifierPosition(touchPosition);
    }
  }, [showLens]);

  const handleClickOrTouch = useCallback((e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    const stage = e.target.getStage();
    const pointerPosition = stage?.getPointerPosition();
    if (pointerPosition) {
      setShowLens(prevShowLens => !prevShowLens);
      setShowRectangle(true);
      setMagnifierPosition(pointerPosition);
    }
  }, []);

  // Calculate lens size based on zoom and dimensions
  const lensSize = useMemo((): Dimensions => {
    if (!image1) return { width: 50, height: 50 };
    
    const sourceWidth = magDimensions.width / zoomScale;
    const sourceHeight = magDimensions.height / zoomScale;
    
    const stageScaleX = stageDimensions.width / image1.width;
    const stageScaleY = stageDimensions.height / image1.height;
    
    return {
      width: isNaN(sourceWidth * stageScaleX) ? 50 : sourceWidth * stageScaleX,
      height: isNaN(sourceHeight * stageScaleY) ? 50 : sourceHeight * stageScaleY
    };
  }, [image1, magDimensions, zoomScale, stageDimensions]);

  // Consistent styling
  const viewContainerStyle: React.CSSProperties = {
    flex: '1 1 400px', 
    maxWidth: '400px',
    height: '400px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    overflow: 'hidden'
  };

  // Handle errors
  useEffect(() => {
    if (error1) console.error("Error loading image 1:", error1);
    if (error2) console.error("Error loading image 2:", error2);
  }, [error1, error2]);

  // Clean up resources on unmount - fixed exhaustive-deps warning
  useEffect(() => {
    return () => {
      // Just ensure ResizeObserver is disconnected
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
    };
  }, []);

  // Pre-load images for better UX
  useEffect(() => {
    const preloadImages = (urls: string[]) => {
      urls.forEach(url => {
        const img = new Image();
        img.src = url;
      });
    };
    
    preloadImages([imageUrl1, imageUrl2]);
  }, [imageUrl1, imageUrl2]);

  return (
    <article style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', lineHeight: '1.6' }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '1rem' }}>
          Comparing Cropped Image Quality
        </h1>
        <p style={{ fontSize: '1rem', color: '#444' }}>
          Tap or click on the image to see the magnified view.
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: '2rem',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}
      >
                <div ref={stageRef} style={{ position: 'relative', width: '100%', maxWidth: '600px', textAlign: 'center' }}>
          <MainImageView
            image={image1}
            loading={loading1}
            stageDimensions={stageDimensions}
            showRectangle={showRectangle}
            magnifierPosition={magnifierPosition}
            lensSize={lensSize}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            onClick={handleClickOrTouch}
          />

          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
            Tap or click on the image to see the magnified view.
          </p>
        </div>

        {/* Magnified view container */}
        <div ref={magnifyRef} style={{
          ...viewContainerStyle,
          display: showLens ? 'block' : 'none'
        }}>
          <MagnifiedView
            image={image1}
            loading={loading1}
            referenceImage={image1} 
            magnifierPosition={magnifierPosition}
            stageDimensions={stageDimensions}
            magDimensions={magDimensions}
            zoomScale={zoomScale}
          />
        </div>

        {/* Compare view container */}
        <div ref={compareRef} style={{
          ...viewContainerStyle,
          height: `${compareHeight}px`,
          display: !showLens ? 'block' : 'none'
        }}>
          {image1 && image2 && !loading1 && !loading2 ? (
            <ReactCompareSlider
              position={50}
              style={{ width: '100%', height: '100%', borderRadius: '8px' }}
              itemOne={
                <div style={{ width: '100%', height: '100%' }} ref={compareStage1Ref}>
                  <MagnifiedView
                    image={image1}
                    loading={loading1}
                    referenceImage={image1} 
                    magnifierPosition={magnifierPosition}
                    stageDimensions={stageDimensions}
                    magDimensions={magDimensions}
                    zoomScale={zoomScale}
                  />
                </div>
              }
              itemTwo={
                <div style={{ width: '100%', height: '100%' }} ref={compareStage2Ref}>
                  <MagnifiedView
                    image={image2}
                    loading={loading2}
                    referenceImage={image1} 
                    magnifierPosition={magnifierPosition}
                    stageDimensions={stageDimensions}
                    magDimensions={magDimensions}
                    zoomScale={zoomScale}
                  />
                </div>
              }
            />
          ) : (
            <div style={{ 
              width: '100%', 
              height: '100%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              backgroundColor: '#f5f5f5'
            }}>
              <div className="loader">Loading...</div>
            </div>
          )}
          <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem', textAlign: 'center' }}>
            Slide to compare between two different magnifications.
          </p>
        </div>
      </div>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Observations</h2>
        <p style={{ fontSize: '1rem', color: '#333' }}>
          The magnified view allows detailed inspection of images by tapping or clicking on them.
        </p>
      </section>
    </article>
  );
}