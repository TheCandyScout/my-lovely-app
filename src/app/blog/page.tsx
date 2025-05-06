/// <reference types="webxr" />
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import * as THREE from "three";

export interface Size {
  size: string;
  price: number;
  widthCm: number;
  heightCm: number;
}

export interface GalleryItem {
  id: number;
  title: string;
  src: string;
  description: string;
  sizes: Size[];
  tags: string[];
}

export default function Gallery() {
  // React state
  const [selectedImage, setSelectedImage] = useState<GalleryItem | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedSize, setSelectedSize] = useState<Size | null>(null);
  const [isARSupported, setIsARSupported] = useState(false);
  const [arSessionActive, setArSessionActive] = useState(false);
  const [windowWidth, setWindowWidth] = useState(1200);

  // Refs for AR / debug
  const arOverlayRef = useRef<HTMLDivElement>(null);
  const debugPanelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const xrSessionRef = useRef<XRSession | null>(null);
  const frameRef = useRef<number | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null | undefined>(undefined);

  // -------------- Debug logger ----------------
  function logDebug(...args: unknown[]) {
    console.log("[AR DEBUG]", ...args);
    const panel = debugPanelRef.current;
    if (!panel) return;

    const line = document.createElement("div");
    const text = args
      .map((a) => {
        if (typeof a === "object" && a !== null) {
          // JSON-stringify objects (safe under unknown)
          return JSON.stringify(a, null, 2);
        }
        return String(a);
      })
      .join(" ");
    line.textContent = text;
    panel.appendChild(line);

    // keep last 200 lines
    while (panel.childElementCount > 200) {
      panel.removeChild(panel.firstChild!);
    }
    panel.scrollTop = panel.scrollHeight;
  }

  // -------------- AR teardown -----------------
  const endARSession = useCallback(() => {
    if (xrSessionRef.current) {
      logDebug("ending XRSession");
      xrSessionRef.current.end();
      xrSessionRef.current = null;
    }
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (canvasRef.current?.parentElement) {
      canvasRef.current.parentElement.removeChild(canvasRef.current);
      canvasRef.current = null;
    }
    if (hitTestSourceRef.current) {
      hitTestSourceRef.current.cancel();
      hitTestSourceRef.current = null;
    }
    setArSessionActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      endARSession();
    };
  }, [endARSession]);

  // -------------- Window size ---------------
  useEffect(() => {
    function onResize() {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    onResize();
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // -------------- AR support ----------------
  useEffect(() => {
    if (navigator.xr?.isSessionSupported) {
      navigator.xr
        .isSessionSupported("immersive-ar")
        .then((supported) => {
          setIsARSupported(supported);
          logDebug("AR supported?", supported);
        })
        .catch((err) => logDebug("AR support check failed", err));
    }
  }, []);

  // ------------- Sample items ----------------
  const galleryItems: GalleryItem[] = [
    {
      id: 1,
      title: "Mountain Sunset",
      src: "/my-lovely-app/images/source.jpg",
      description:
        "35mm film scan of mountain landscape at sunset. Captured on Kodak Portra 400 with a Nikon F3.",
      sizes: [
        { size: '8x10"', price: 45, widthCm: 25.4, heightCm: 20.32 },
        { size: '11x14"', price: 75, widthCm: 35.56, heightCm: 27.94 },
        { size: '16x20"', price: 120, widthCm: 50.8, heightCm: 40.64 },
      ],
      tags: ["landscape", "35mm", "color"],
    },
    // …add more items…
  ];

  // ------------- Modal controls -------------
  function openImageDetails(item: GalleryItem) {
    setSelectedImage(item);
    setShowDetails(false);
    setSelectedSize(null);
  }
  function toggleDetails() {
    setShowDetails((v) => !v);
  }
  function handleSizeSelect(s: Size) {
    setSelectedSize(s);
  }
  function closeImageModal() {
    setSelectedImage(null);
    endARSession();
  }

  // ----------- AR launch routine ------------
  async function launchAR(image: GalleryItem, size: Size) {
    // clear old logs
    if (debugPanelRef.current) debugPanelRef.current.innerHTML = "";
    logDebug("→ launchAR()", { image, size });

    if (!isARSupported) {
      logDebug("← AR not supported");
      return;
    }

    try {
      // 1) camera permission
      logDebug("1) requesting camera permission");
      const cam = await navigator.mediaDevices.getUserMedia({ video: true });
      cam.getTracks().forEach((t) => t.stop());
      logDebug("→ camera granted");

      // 2) XRSession
      logDebug("2) requesting XRSession");
      const session = await navigator.xr!.requestSession("immersive-ar", {
        requiredFeatures: ["hit-test"],
        optionalFeatures: ["dom-overlay", "camera-access"],
        domOverlay: { root: arOverlayRef.current! },
      });
      xrSessionRef.current = session;
      setArSessionActive(true);
      logDebug("→ XRSession started");

      // diagnostic text
      const diag = document.createElement("div");
      Object.assign(diag.style, {
        position: "absolute",
        top: "5px",
        left: "5px",
        background: "rgba(0,0,0,0.7)",
        color: "white",
        padding: "4px",
        fontSize: "10px",
        zIndex: "9999",
        pointerEvents: "none",
      });
      diag.innerText = "AR initializing…";
      document.body.appendChild(diag);
      logDebug("3) diag overlay added");

      // 4) canvas & GL
      const canvas = document.createElement("canvas");
      Object.assign(canvas.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
      });
      document.body.appendChild(canvas);
      canvasRef.current = canvas;
      logDebug("4) canvas added");

      const gl = canvas.getContext("webgl2", {
        xrCompatible: true,
        alpha: true,
      })!;
      await gl.makeXRCompatible();
      logDebug("→ gl.makeXRCompatible()");

      // 5) XRWebGLLayer
      const xrLayer = new XRWebGLLayer(session, gl);
      await session.updateRenderState({ baseLayer: xrLayer });
      logDebug("5) XRWebGLLayer bound");

      // 6) Three renderer
      const renderer = new THREE.WebGLRenderer({ canvas, context: gl, alpha: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType("local");
      renderer.xr.setSession(session);
      logDebug("6) Three.js renderer ready");

      // 7) Scene & lights
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1));
      const dir = new THREE.DirectionalLight(0xffffff, 1.2);
      dir.position.set(0, 5, 0);
      scene.add(dir);

      // 8) Camera
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.set(0, 1.6, 3);

      // 9) Hit-test
      const localRef = await session.requestReferenceSpace("local");
      const viewerRef = await session.requestReferenceSpace("viewer");
      logDebug("7) refe rence spaces OK");
      const hitSource = await session.requestHitTestSource!({ space: viewerRef });
      hitTestSourceRef.current = hitSource;
      logDebug("8) hit-test source OK");

      // 10) Build picture group
      const pictureGroup = new THREE.Group();
      scene.add(pictureGroup);
      logDebug("9) pictureGroup created");
        const w = size.widthCm * 0.01, h = size.heightCm * 0.01;
        const texLoader = new THREE.TextureLoader();
        texLoader.setCrossOrigin("anonymous");

        texLoader.load(
          // your public-folder URL, e.g. "/images/source.jpg"
          image.src,
        
          // onLoad
          (texture) => {
            logDebug("✅ texture loaded", image.src);
        
            // correct color encoding
            texture.colorSpace = THREE.SRGBColorSpace;
            // prevent Y-flipping on the plane UVs
            texture.flipY = false;
            texture.needsUpdate = true;
            // create your mesh
            const mat = new THREE.MeshBasicMaterial({
              map: texture,
              side: THREE.DoubleSide,
              transparent: false,
            });
            const geo = new THREE.PlaneGeometry(w, h);
            const picPlane = new THREE.Mesh(geo, mat);
            picPlane.position.z = 0.01; // nudge it forward
            pictureGroup.add(picPlane);
          },
      
          // onProgress
          (xhr) => {
            if (xhr.total) {
              const pct = ((xhr.loaded / xhr.total) * 100).toFixed(0);
              logDebug(`Loading texture ${pct}%`);
            }
          },
      
          // onError
          (err) => {
            logDebug("❌ texture load error:", err);
          }
        );

      // 11) Tap-to-place
      let placed = false;
      session.addEventListener("select", (ev: XRInputSourceEvent) => {
        logDebug("select fired");
        const results = ev.frame.getHitTestResults(hitTestSourceRef.current!);
        logDebug("hit-test results:", results.length);
        if (results.length && !placed) {
          placed = true;
          const pose = results[0].getPose(localRef)!;
          logDebug("→ placing at", pose.transform);
          pictureGroup.position.copy(pose.transform.position);
          pictureGroup.quaternion.copy(pose.transform.orientation);
          diag.innerText = "Placed!";
        }
      });

      // 12) Fallback
      const fallbackId = window.setTimeout(() => {
        if (!placed) {
          placed = true;
          logDebug("⚠ fallback placement");
          const eyeY = camera.position.y;
          pictureGroup.position.set(0, eyeY - h / 2, -2);
          pictureGroup.lookAt(camera.position);
          diag.innerText = "Fallback placed";
        }
      }, 5000);

      // 13) Render loop
      function onXRFrame(time: number, frame: XRFrame) {
        frameRef.current = session.requestAnimationFrame(onXRFrame);
      
        const baseLayer = session.renderState.baseLayer!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
      
        const pose = frame.getViewerPose(localRef);
        if (pose) {
          const view = pose.views[0];
          const vp = baseLayer.getViewport(view);
          if (!vp) {logDebug("vp is null"); return;}
          renderer.setViewport(0, 0, vp.width, vp.height);
          camera.matrix.fromArray(view.transform.matrix);
          camera.projectionMatrix.fromArray(view.projectionMatrix);
        } else {
          // No real XR pose—just render full-screen with your “default” camera
          renderer.setViewport(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight
          );
          // camera stays at its initial position
        }
      
        camera.updateMatrixWorld(true);
        renderer.render(scene, camera);
      }
      session.requestAnimationFrame(onXRFrame);

      // Cleanup when session ends
      session.addEventListener("end", () => {
        logDebug("XRSession ended");
        clearTimeout(fallbackId);
        endARSession();
      });
    } catch (err) {
      logDebug("❌ launchAR error", err);
      endARSession();
    }
  }

  // -------------- Render --------------------
  return (
    <>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "2rem" }}>
        <h1 style={{ textAlign: "center", fontWeight: 300 }}>Print Collection</h1>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
            gap: "2rem",
          }}
        >
          {galleryItems.map((item) => (
            <div
              key={item.id}
              onClick={() => openImageDetails(item)}
              style={{
                cursor: "pointer",
                overflow: "hidden",
                borderRadius: 8,
                boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                background: "white",
              }}
            >
              <div style={{ position: "relative", height: 240 }}>
                <Image
                  src={item.src}
                  alt={item.title}
                  fill
                  style={{ objectFit: "cover" }}
                />
              </div>
              <div style={{ padding: "1rem", borderTop: "1px solid #eee" }}>
                <h3 style={{ margin: 0 }}>{item.title}</h3>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        background: "#f0f0f0",
                        padding: "0.2rem 0.5rem",
                        borderRadius: 12,
                        fontSize: 12,
                        color: "#666",
                      }}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        {selectedImage && (
          <div
            onClick={closeImageModal}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0,0,0,0.85)",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              zIndex: 1000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "white",
                borderRadius: 8,
                display: windowWidth > 768 ? "flex" : "block",
                width: "90%",
                maxWidth: 1200,
                maxHeight: "90vh",
                overflow: "hidden",
              }}
            >
              <button
                onClick={closeImageModal}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 20,
                  fontSize: 24,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  zIndex: 1,
                }}
              >
                ×
              </button>
              <div
                style={{
                  flex: 3,
                  position: "relative",
                  background: "#f5f5f5",
                  height: windowWidth > 768 ? "80vh" : 240,
                }}
              >
                <Image
                  src={selectedImage.src}
                  alt={selectedImage.title}
                  fill
                  style={{ objectFit: "contain" }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  padding: "2rem",
                  overflowY: "auto",
                  borderLeft: windowWidth > 768 ? "1px solid #eee" : "none",
                }}
              >
                <h2 style={{ marginTop: 0 }}>{selectedImage.title}</h2>
                <button onClick={toggleDetails} style={{ marginBottom: "1rem" }}>
                  {showDetails ? "Hide Details" : "Show Details"}
                </button>
                {showDetails && <p>{selectedImage.description}</p>}
                <h3>Available Sizes</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {selectedImage.sizes.map((opt) => (
                    <li key={opt.size} style={{ marginBottom: "1rem" }}>
                      <label style={{ cursor: "pointer" }}>
                        <input
                          type="radio"
                          name="size"
                          checked={selectedSize === opt}
                          onChange={() => handleSizeSelect(opt)}
                        />{" "}
                        {opt.size} — ${opt.price}
                      </label>
                      {isARSupported && (
                        <button
                          onClick={() => launchAR(selectedImage, opt)}
                          disabled={arSessionActive}
                          style={{ marginLeft: 8 }}
                        >
                          {arSessionActive ? "AR Active" : "View in Your Space"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* AR overlay container */}
        <div
          ref={arOverlayRef}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            zIndex: 1100,
            pointerEvents: "none",
          }}
        />

        {/* DEBUG panel */}
        <div
          ref={debugPanelRef}
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            width: "100%",
            maxHeight: "200px",
            overflowY: "auto",
            background: "rgba(0,0,0,0.6)",
            color: "#0f0",
            fontSize: "11px",
            fontFamily: "monospace",
            padding: "4px 8px",
            zIndex: 1200,
            pointerEvents: "none",
          }}
        />
      </div>
    </>
  );
}