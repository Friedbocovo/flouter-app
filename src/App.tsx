import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, RotateCcw, Image as ImageIcon, SquareDashedMousePointer, Eraser, Loader2 } from 'lucide-react';

// Options d'intensité de flou disponibles
const BLUR_INTENSITY_OPTIONS = [5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100];
const DEFAULT_BLUR_INTENSITY = 15; // Intensité par défaut

// Interface TypeScript pour définir la forme du rectangle de sélection
interface SelectionRect {
  startX: number;
  startY: number;
  width: number;
  height: number;
}

function App() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [blurIntensity, setBlurIntensity] = useState<number>(DEFAULT_BLUR_INTENSITY); // Nouvelle intensité de flou
  const [isProcessing, setIsProcessing] = useState(false); // État pour l'animation de chargement

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fonction utilitaire pour obtenir les coordonnées du canvas à partir d'événements souris ou tactile
  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // --- GESTION DU CANVAS ET DU DESSIN ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!image || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Ajuster le canvas à la taille native de l'image pour un rendu haute résolution
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;

    // Toujours dessiner l'image actuelle (qui peut déjà contenir du flou)
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Dessiner la zone de sélection (cadre en pointillé)
    // Elle est dessinée si une sélection valide existe
    if (selection && selection.width > 0 && selection.height > 0) { 
      // Calculer le facteur d'échelle basé sur la largeur actuelle affichée dans le conteneur
      // pour que l'épaisseur de la ligne reste visible
      const scaleFactor = canvas.width / (containerRef.current?.offsetWidth || 1); 
      ctx.strokeStyle = '#3b82f6'; // Bleu
      ctx.lineWidth = 3 * scaleFactor; 
      ctx.setLineDash([10 * scaleFactor, 5 * scaleFactor]);
      ctx.strokeRect(selection.startX, selection.startY, selection.width, selection.height);
      ctx.setLineDash([]); // Réinitialiser le style de ligne
    }
  }, [image, selection]); 

  // --- GESTION DE L'UPLOAD ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true); // Activer l'animation de chargement
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setOriginalImage(event.target?.result as string);
        setSelection(null);
        setIsProcessing(false); // Désactiver l'animation de chargement
        
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          canvas.getContext('2d')?.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight);
        }
      };
      img.onerror = () => setIsProcessing(false); // Désactiver en cas d'erreur
      img.src = event.target?.result as string;
    };
    reader.onerror = () => setIsProcessing(false); // Désactiver en cas d'erreur
    reader.readAsDataURL(file);
  };

  // --- GESTION DE LA SÉLECTION (SOURIS ET TOUCH) ---
  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!image || isProcessing) return; // Empêcher la sélection pendant le traitement

    const coords = getCanvasCoordinates(e as unknown as React.MouseEvent<HTMLCanvasElement>);
    setStartPoint(coords);
    setIsSelecting(true);
    setSelection(null); // Commencez une nouvelle sélection
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isSelecting || !startPoint || !image || isProcessing) return; // Empêcher le mouvement pendant le traitement

    const coords = getCanvasCoordinates(e as unknown as React.MouseEvent<HTMLCanvasElement>);
    const width = coords.x - startPoint.x;
    const height = coords.y - startPoint.y;

    setSelection({
      startX: width > 0 ? startPoint.x : coords.x,
      startY: height > 0 ? startPoint.y : coords.y,
      width: Math.abs(width),
      height: Math.abs(height),
    });
  };

  const handleEnd = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsSelecting(false); 
    setStartPoint(null); // Réinitialiser le point de départ
  };

  // --- LOGIQUE D'APPLICATION DU FLOU ---
  const applyEffect = () => {
    if (!selection || !canvasRef.current || !image || isProcessing) return; 
    if (selection.width === 0 || selection.height === 0) { // S'assurer que la sélection est valide
      setSelection(null); // Supprimer la sélection si elle est nulle ou trop petite
      return;
    }

    setIsProcessing(true); // Activer l'animation de traitement

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        setIsProcessing(false);
        return;
    }
    
    requestAnimationFrame(() => {
        // Redessiner l'image de base actuelle pour nettoyer l'affichage avant d'appliquer le nouvel effet
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

        // Appliquer le flou ciblé
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = selection.width;
        tempCanvas.height = selection.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
            setIsProcessing(false);
            return;
        }

        tempCtx.drawImage(
            image, 
            selection.startX,
            selection.startY,
            selection.width,
            selection.height,
            0, 
            0, 
            selection.width,
            selection.height
        );

        // Utiliser l'intensité choisie par l'utilisateur (blurIntensity)
        tempCtx.filter = `blur(${blurIntensity}px)`; 
        // Important: Redessiner le canvas temporaire sur lui-même pour appliquer le filtre
        tempCtx.drawImage(tempCanvas, 0, 0); 

        // Dessiner le contenu flouté sur le canvas principal
        ctx.drawImage(
            tempCanvas,
            0,
            0,
            selection.width,
            selection.height,
            selection.startX,
            selection.startY,
            selection.width,
            selection.height
        );
        
        // Mettre à jour l'image principale pour que le flou devienne permanent
        const newModifiedImage = new Image();
        newModifiedImage.onload = () => {
            setImage(newModifiedImage); 
            setSelection(null); // Retirer la sélection APRÈS le traitement
            setIsProcessing(false); // Désactiver l'animation après le traitement
        }
        newModifiedImage.onerror = () => {
            setSelection(null); // Retirer la sélection même en cas d'erreur
            setIsProcessing(false);
        };
        newModifiedImage.src = canvas.toDataURL('image/png');
    });
  };

  // --- GESTION DU TÉLÉCHARGEMENT ET DE LA RÉINITIALISATION ---
  const handleDownload = () => {
    if (!canvasRef.current || isProcessing) return; 

    const canvas = canvasRef.current;
    const link = document.createElement('a');
    link.download = 'image-confidentielle.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleReset = () => {
    if (originalImage) {
      setIsProcessing(true);
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setSelection(null);
        setBlurIntensity(DEFAULT_BLUR_INTENSITY); // Réinitialiser l'intensité du flou
        setIsProcessing(false);
      };
      img.onerror = () => setIsProcessing(false);
      img.src = originalImage;
    }
  };

  // Déterminer si l'image actuelle est la même que l'originale pour l'état des boutons
  const isModified = image && originalImage && image.src !== originalImage;
  const isSelectionReady = selection && selection.width > 0 && selection.height > 0 && !isProcessing;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 font-inter p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* En-tête de l'application */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 flex items-center justify-center gap-3">
            <ImageIcon className="w-10 h-10 md:w-12 md:h-12 text-blue-400" />
            Flouteur d'Image
          </h1>
          <p className="text-slate-300 text-base md:text-lg">
            Masquez les informations sensibles avec un flou personnalisable.
          </p>
        </div>

        {/* Bloc d'Upload initial */}
        {!image ? (
          <div className="bg-slate-800 rounded-2xl shadow-2xl p-8 md:p-12 border border-slate-700">
            <div
              onClick={() => !isProcessing && fileInputRef.current?.click()} // Désactiver le clic si en traitement
              className={`border-4 border-dashed border-slate-600 rounded-xl p-12 md:p-20 text-center transition-all duration-300
                ${isProcessing ? 'cursor-not-allowed bg-slate-700/50' : 'cursor-pointer hover:border-blue-400 hover:bg-slate-700/30'}`}
            >
              {isProcessing ? (
                <Loader2 className="w-16 h-16 md:w-20 md:h-20 text-blue-400 mx-auto mb-6 animate-spin" />
              ) : (
                <Upload className="w-16 h-16 md:w-20 md:h-20 text-slate-400 mx-auto mb-6" />
              )}
              <h2 className="text-xl md:text-2xl font-semibold text-white mb-3">
                {isProcessing ? 'Chargement de l\'image...' : 'Importez votre image'}
              </h2>
              <p className="text-slate-400 text-sm md:text-base">
                {isProcessing ? 'Veuillez patienter' : 'Cliquez pour sélectionner une image (PNG, JPG)'}
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              disabled={isProcessing}
            />
          </div>
        ) : (
          /* Espace de travail de l'éditeur */
          <div className="space-y-6">
            <div className="bg-slate-800 rounded-2xl shadow-2xl p-4 md:p-8 border border-slate-700">
              <div className="flex flex-col lg:flex-row gap-6">
                
                {/* Zone de prévisualisation (Canvas) */}
                <div className="flex-1 min-w-0">
                  <div className="bg-slate-900 rounded-xl p-2 md:p-4 border border-slate-700 shadow-inner relative">
                    <div ref={containerRef} className="overflow-auto max-h-[70vh] w-full mx-auto">
                      <canvas
                        ref={canvasRef}
                        // Gestion de la souris
                        onMouseDown={handleStart}
                        onMouseMove={handleMove}
                        onMouseUp={handleEnd}
                        onMouseLeave={handleEnd}
                        // Gestion du tactile (mobile)
                        onTouchStart={handleStart}
                        onTouchMove={handleMove}
                        onTouchEnd={handleEnd}

                        className={`w-full h-auto mx-auto shadow-xl transition-shadow duration-300 rounded-lg 
                          ${isProcessing ? 'cursor-wait opacity-70' : 'cursor-crosshair'}` // Opacité pendant le traitement
                        }
                        style={{ display: 'block', maxWidth: '100%' }}
                      />
                    </div>
                    {isProcessing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70 rounded-xl animate-pulse">
                        <Loader2 className="w-16 h-16 text-blue-400 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Message d'instruction */}
                  {!isSelectionReady && !isProcessing && ( 
                    <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg shadow-md animate-fade-in">
                      <p className="text-blue-300 text-sm md:text-base text-center font-medium flex items-center justify-center gap-2">
                        <SquareDashedMousePointer className="w-5 h-5" />
                        Dessinez le rectangle de la zone à masquer.
                      </p>
                    </div>
                  )}
                  {isModified && !isProcessing && ( 
                    <div className={`mt-4 p-4 bg-green-500/10 border-green-500/30 rounded-lg shadow-md animate-fade-in`}>
                      <p className={`text-sm md:text-base text-center font-medium text-green-300`}>
                        Flou appliqué ! Vous pouvez sélectionner une nouvelle zone ou télécharger.
                      </p>
                    </div>
                  )}
                  {isProcessing && (
                     <div className="mt-4 p-4 bg-slate-500/10 border border-slate-500/30 rounded-lg shadow-md animate-fade-in">
                        <p className="text-slate-300 text-sm md:text-base text-center font-medium flex items-center justify-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Application du flou...
                        </p>
                    </div>
                  )}
                </div>

                {/* Panneau de Contrôle */}
                <div className="lg:w-72 space-y-4">
                  <div className="bg-slate-900 rounded-xl p-4 md:p-6 border border-slate-700 shadow-lg animate-fade-in">
                    <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2">
                      Options de flou
                    </h3>
                    
                    {selection && (
                      <div className="bg-slate-800 rounded-lg p-3 mb-4 animate-scale-in border border-blue-500/30">
                        <h4 className="text-sm font-semibold text-slate-400 mb-1">
                          Zone sélectionnée
                        </h4>
                        <p className="text-blue-400 font-mono text-sm">
                          {Math.round(selection.width)} × {Math.round(selection.height)} px
                        </p>
                      </div>
                    )}

                    {/* Sélecteur d'intensité de flou */}
                    <div className="mb-4">
                        <label htmlFor="blur-intensity" className="block text-slate-300 text-sm font-medium mb-2">
                            Intensité du flou (px) :
                        </label>
                        <select
                            id="blur-intensity"
                            value={blurIntensity}
                            onChange={(e) => setBlurIntensity(Number(e.target.value))}
                            disabled={isProcessing}
                            className="w-full p-2.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-base focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                        >
                            {BLUR_INTENSITY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option} px
                                </option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={applyEffect}
                        disabled={!isSelectionReady || isProcessing}
                        aria-label={`Appliquer un flou de ${blurIntensity}px à la zone sélectionnée`}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 mb-5 text-base shadow-lg hover:shadow-xl flex items-center justify-center gap-2 transform hover:scale-105 active:scale-98"
                    >
                        <Eraser className="w-5 h-5" />
                        Appliquer le flou 
                    </button>
                    
                    <h3 className="text-lg font-bold text-white mb-4 border-b border-slate-700 pb-2">
                      Actions
                    </h3>

                    <button
                      onClick={handleDownload}
                      disabled={!isModified || isProcessing}
                      aria-label="Télécharger l'image modifiée"
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mb-3 text-base shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-98"
                    >
                      <Download className="w-5 h-5" />
                      Télécharger l'image
                    </button>

                    <button
                      onClick={handleReset}
                      disabled={!isModified || isProcessing}
                      aria-label="Réinitialiser l'image à sa version originale"
                      className="w-full bg-slate-500 hover:bg-slate-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mb-3 text-base shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-98"
                    >
                      <RotateCcw className="w-5 h-5" />
                      Réinitialiser
                    </button>
                    
                    <hr className="border-slate-700 my-4" />

                    <button
                      onClick={() => {
                        setImage(null);
                        setOriginalImage(null);
                        setSelection(null);
                        setBlurIntensity(DEFAULT_BLUR_INTENSITY); // Réinitialiser l'intensité du flou
                      }}
                      disabled={isProcessing}
                      aria-label="Importer une nouvelle image"
                      className="w-full bg-slate-700 hover:bg-slate-600 text-white font-semibold py-3 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-base shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-98"
                    >
                      <Upload className="w-5 h-5" />
                      Nouvelle image
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
