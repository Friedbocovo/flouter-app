import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Upload, Download, RotateCcw, Image as ImageIcon, Loader2, BookOpen, Settings, CheckCircle, Crosshair, ChevronDown, ChevronUp } from 'lucide-react';

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
  const [blurIntensity, setBlurIntensity] = useState<number>(DEFAULT_BLUR_INTENSITY);
  const [isProcessing, setIsProcessing] = useState(false);
  // Le guide est fermé par défaut
  const [showHowItWorks, setShowHowItWorks] = useState(false); 

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fonction utilitaire pour obtenir les coordonnées du canvas à partir d'événements souris ou tactile
  const getCanvasCoordinates = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    // Gère à la fois les événements tactiles (touches) et les événements de souris (clientX)
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Convertit les coordonnées d'affichage (pixels de l'écran) en coordonnées réelles du canvas (pixels de l'image)
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  // --- FONCTION DE DESSIN DU CANVAS (Réutilisée par useEffect ET manuellement) ---
  const drawCanvas = useCallback((currentImage: HTMLImageElement | null, currentSelection: SelectionRect | null) => {
      const canvas = canvasRef.current;
      if (!currentImage || !canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Ajuster le canvas à la taille native de l'image pour un rendu haute résolution
      canvas.width = currentImage.naturalWidth;
      canvas.height = currentImage.naturalHeight;

      // Toujours dessiner l'image actuelle
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height);

      // Dessiner la zone de sélection (Bleu vif) si une sélection est fournie
      if (currentSelection && currentSelection.width > 0 && currentSelection.height > 0) { 
          // Calculer un facteur d'échelle pour que le cadre soit visible quelle que soit la taille de l'image
          const scaleFactor = canvas.width / (containerRef.current?.offsetWidth || 1); 
          // Cadre bleu vif
          ctx.strokeStyle = '#3b82f6'; // Bleu (blue-500 de Tailwind)
          ctx.lineWidth = 4 * scaleFactor;
          ctx.setLineDash([15 * scaleFactor, 8 * scaleFactor]);
          ctx.strokeRect(currentSelection.startX, currentSelection.startY, currentSelection.width, currentSelection.height);
          ctx.setLineDash([]); 
      }
  }, [canvasRef, containerRef]);


  // --- GESTION DU CANVAS ET DU DESSIN (L'effet appelle la fonction de dessin) ---
  useEffect(() => {
    // Lorsque l'état change, on appelle la fonction de dessin avec les états actuels
    drawCanvas(image, selection);
  }, [image, selection, drawCanvas]); 

  // --- GESTION DE L'UPLOAD ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        setOriginalImage(event.target?.result as string);
        setSelection(null);
        setIsProcessing(false);
      };
      img.onerror = () => setIsProcessing(false);
      img.src = event.target?.result as string;
    };
    reader.onerror = () => setIsProcessing(false);
    reader.readAsDataURL(file);
  };

  // --- GESTION DE LA SÉLECTION (SOURIS ET TOUCH) ---
  const handleStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!image || isProcessing) return;

    // Passage direct de l'événement
    const coords = getCanvasCoordinates(e); 
    setStartPoint(coords);
    setIsSelecting(true);
  };

  const handleMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isSelecting || !startPoint || !image || isProcessing) return;

    // Passage direct de l'événement
    const coords = getCanvasCoordinates(e);
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
    setStartPoint(null);
  };

  // --- LOGIQUE D'APPLICATION DU FLOU PERMETTANT LE MULTI-FLOU ---
  const applyEffect = () => {
    if (!selection || !canvasRef.current || !image || isProcessing) return; 
    
    // Sauvegarder la sélection actuelle pour le flou
    const currentSelection = selection;

    if (currentSelection.width === 0 || currentSelection.height === 0) {
      // Si la sélection est invalide, on la réinitialise immédiatement
      setSelection(null); 
      return;
    }

    // 1. DÉCLENCHEUR IMMÉDIAT : Réinitialiser la sélection dans l'état React
    setSelection(null); 
    
    // 2. FORCE LE REDESSIN : Appeler la fonction de dessin manuellement avec NULL 
    // pour garantir que le cadre disparaisse immédiatement, sans attendre le batching.
    drawCanvas(image, null);

    setIsProcessing(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        setIsProcessing(false);
        return;
    }
    
    requestAnimationFrame(() => {
        
        // Créer un canvas temporaire pour isoler et flouter SEULEMENT la nouvelle zone
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = currentSelection.width;
        tempCanvas.height = currentSelection.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
            setIsProcessing(false);
            return;
        }

        // Dessiner la zone sélectionnée de l'IMAGE ACTUELLE (qui peut déjà être floutée) sur le canvas temporaire
        tempCtx.drawImage(
            image, // Utiliser l'image d'état actuelle
            currentSelection.startX,
            currentSelection.startY,
            currentSelection.width,
            currentSelection.height,
            0, 
            0, 
            currentSelection.width,
            currentSelection.height
        );

        // Appliquer le filtre de flou
        tempCtx.filter = `blur(${blurIntensity}px)`; 
        // Dessiner sur lui-même avec le filtre appliqué pour l'effet de flou
        tempCtx.drawImage(tempCanvas, 0, 0); 

        // Coller la zone floutée du canvas temporaire SUR le canvas principal (sans effacer le reste)
        ctx.drawImage(
            tempCanvas,
            0,
            0,
            currentSelection.width,
            currentSelection.height,
            currentSelection.startX,
            currentSelection.startY,
            currentSelection.width,
            currentSelection.height
        );
        
        // Mettre à jour l'image d'état avec le nouveau contenu du canvas principal
        const newModifiedImage = new Image();
        newModifiedImage.onload = () => {
            setImage(newModifiedImage); 
            // La sélection est déjà null, il suffit de terminer le traitement
            setIsProcessing(false);
        }
        newModifiedImage.onerror = () => {
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
        setBlurIntensity(DEFAULT_BLUR_INTENSITY);
        setIsProcessing(false);
      };
      img.onerror = () => setIsProcessing(false);
      img.src = originalImage;
    }
  };

  const isModified = image && originalImage && image.src !== originalImage;
  const isSelectionReady = selection && selection.width > 0 && selection.height > 0 && !isProcessing;

  // Composant pour une étape du "Comment ça marche"
  const StepItem = ({ icon: Icon, title, description }: { icon: React.ElementType, title: string, description: string }) => (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-5 h-5 text-white" />
        <h4 className="font-semibold text-white">{title}</h4>
      </div>
      <p className="text-slate-400 text-sm">{description}</p>
    </div>
  );
  
  // Composant du bloc "Comment ça marche ?"
  const HowItWorksBlock = () => {
      // Choix de l'icône de la flèche
      const ChevronIcon = showHowItWorks ? ChevronUp : ChevronDown;

      return (
        <div className="mt-6 bg-[#1e1e1e] rounded-xl border border-slate-700  ">
            <div 
              className="p-4 cursor-pointer flex justify-between items-center transition-all duration-200 hover:bg-slate-800 rounded-xl"
              onClick={() => setShowHowItWorks(!showHowItWorks)}
            >
              <h2 className="text-xl font-bold flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-blue-500" />
                Comment ça marche ?
              </h2>
              
              {/* Le texte est affiché sur desktop, l'icône est affichée sur mobile */}
              <div className="flex items-center gap-2">
                {/* Texte visible sur desktop (md et plus) */}
                <p className="hidden md:block text-sm text-slate-400 underline">
                    {showHowItWorks ? "Masquer les étapes" : "Afficher les étapes"}
                </p>
                {/* Icône visible sur mobile (jusqu'à md) */}
                <ChevronIcon className="w-5 h-5 text-slate-400 md:hidden transition-transform duration-300" />
              </div>
            </div>

            <div className={`transition-all duration-300 ease-in-out ${showHowItWorks ? 'opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
                <div className="p-4 pt-0 transition-all duration-300 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StepItem 
                      icon={Upload} 
                      title="Téléchargez votre image" 
                      description="Importez une image depuis votre appareil pour commencer l'édition." 
                    />
                    <StepItem 
                      icon={Crosshair} 
                      title="Sélectionnez la zone à flouter" 
                      description="Dessinez ou ajustez le cadre de sélection sur la partie de l'image à modifier. Répétez pour flouter plusieurs zones !" 
                    />
                    <StepItem 
                      icon={Settings} 
                      title="Ajustez l'intensité" 
                      description="Utilisez le sélecteur pour contrôler le niveau de flou souhaité (en pixels)." 
                    />
                    <StepItem 
                      icon={CheckCircle} 
                      title="Appliquez et Téléchargez" 
                      description="Finalisez le flou et téléchargez votre image modifiée en toute simplicité." 
                    />
                </div>
            </div>
        </div>
      );
  };


  // Fonction pour importer une nouvelle image
  const importNewImage = () => {
    setImage(null);
    setOriginalImage(null);
    setSelection(null);
    setBlurIntensity(DEFAULT_BLUR_INTENSITY);
    setShowHowItWorks(false);
  };
  
  // Rendu principal
  return (
    <div className="min-h-screen bg-black font-inter p-4 md:p-8 text-white">
      <div className="max-w-7xl mx-auto">
        {/* En-tête de l'application */}
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white flex items-center justify-center gap-3">
            <ImageIcon className="w-10 h-10 text-white" />
            Flouteur d'Image
          </h1>
        </div>

        {/* Bloc d'Upload initial / Espace de travail */}
        {!image ? (
          // Conteneur flexible pour l'upload (qui est maintenant le seul élément majeur)
          <div className="space-y-6">
             <div className="flex-1 min-w-0 bg-[#1e1e1e] rounded-xl shadow-2xl p-8 md:p-12 border border-slate-700">
                <div
                  onClick={() => !isProcessing && fileInputRef.current?.click()}
                  className={`border-4 border-dashed border-slate-700 rounded-xl p-12 md:p-20 text-center transition-all duration-300
                      ${isProcessing 
                      ? 'cursor-not-allowed bg-slate-800/50' 
                      : 'cursor-pointer hover:border-blue-500 hover:bg-slate-800/30 active:scale-[0.99] transform'}`
                  }
                >
                {isProcessing ? (
                    <Loader2 className="w-16 h-16 md:w-20 md:h-20 text-blue-500 mx-auto mb-6 animate-spin" />
                ) : (
                    <Upload className="w-16 h-16 md:w-20 md:h-20 text-slate-400 mx-auto mb-6" />
                )}
                <h2 className="text-xl md:text-2xl font-semibold text-white mb-3">
                    {isProcessing ? "Chargement de l'image..." : "Importez votre image"}
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
            
            {/* Section Comment ça Marche ? - TOUJOURS EN BAS */}
            <HowItWorksBlock />
          </div>

        ) : (
          /* Espace de travail de l'éditeur */
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-6">
            
              {/* Colonne de gauche (Canvas) */}
              <div className="flex-1 min-w-0">
                
                {/* Zone de prévisualisation (Canvas) */}
                <div className="bg-[#1e1e1e] rounded-xl p-2 md:p-4 border border-slate-700 shadow-xl relative">
                  {/* max-h-[70vh] assure une hauteur maximale sur les grands écrans */}
                  <div ref={containerRef} className="overflow-auto max-h-[70vh] w-full mx-auto"> 
                    <canvas
                      ref={canvasRef}
                      onMouseDown={handleStart}
                      onMouseMove={handleMove}
                      onMouseUp={handleEnd}
                      onMouseLeave={handleEnd}
                      onTouchStart={handleStart}
                      onTouchMove={handleMove}
                      onTouchEnd={handleEnd}

                      className={`w-full h-auto mx-auto rounded-lg 
                        ${isProcessing ? 'cursor-wait opacity-70' : 'cursor-crosshair'}`
                      }
                      style={{ display: 'block', maxWidth: '100%' }}
                    />
                  </div>
                  {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#1e1e1e]/70 rounded-xl">
                      <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
                    </div>
                  )}
                </div>
              </div>

              {/* Colonne de droite (Panneau de Contrôle) - Fixée à lg:w-80 sur desktop, prend toute la largeur sur mobile */}
              <div className="lg:w-80 bg-[#1e1e1e] rounded-xl border border-slate-700 p-4 md:p-6 shadow-xl space-y-4 h-fit">
                
                {/* Option de flou */}
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-white border-b border-slate-700 pb-2">
                    Option de flou
                  </h3>
                  <p className="text-sm text-slate-400 mb-4">
                    Ajustez les paramètres de flou et les actions d'image.
                  </p>
                  
                  {/* Intensité du flou */}
                  <div className="mb-4">
                      <label htmlFor="blur-intensity" className="block text-slate-300 text-sm font-medium mb-2">
                          Intensité du flou (px) :
                      </label>
                      <div className='flex items-center gap-2'>
                        <select
                            id="blur-intensity"
                            value={blurIntensity}
                            onChange={(e) => setBlurIntensity(Number(e.target.value))}
                            disabled={isProcessing}
                            className="flex-1 p-2 rounded-lg bg-black border border-slate-700 text-white text-base focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                        >
                            {BLUR_INTENSITY_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option} px
                                </option>
                            ))}
                        </select>
                        {/* Affichage de la sélection */}
                        {selection && (
                          <span className="text-xs bg-slate-700 text-blue-300 px-2 py-1.5 rounded-md font-mono whitespace-nowrap">
                            {Math.round(selection.width)}×{Math.round(selection.height)} px
                          </span>
                        )}
                      </div>
                  </div>

                  {/* Bouton APPLIQUER (Bleu uni) */}
                  <button
                      onClick={applyEffect}
                      disabled={!isSelectionReady || isProcessing}
                      aria-label={`Appliquer un flou de ${blurIntensity}px à la zone sélectionnée`}
                      className={`w-full font-bold py-2.5 px-4 rounded-lg transition-all duration-200 text-base shadow-md
                          ${isSelectionReady && !isProcessing
                              ? 'bg-blue-600 hover:bg-blue-700 text-white'
                              : 'bg-slate-700 text-slate-500 cursor-not-allowed disabled:opacity-75'
                          }
                          flex items-center justify-center gap-2`}
                  >
                      {isProcessing ? (
                          <>
                              <Loader2 className="w-5 h-5 animate-spin" /> Traitement...
                          </>
                      ) : (
                          `Appliquer le flou`
                      )}
                  </button>
                </div>

                {/* Actions */}
                <div className="space-y-4 pt-4">
                  <h3 className="text-lg font-bold text-white border-b border-slate-700 pb-2">
                    Actions
                  </h3>

                  {/* Bouton TÉLÉCHARGER (Vert uni) */}
                  <button
                    onClick={handleDownload}
                    disabled={!isModified || isProcessing}
                    aria-label="Télécharger l'image modifiée"
                    className={`w-full font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-base
                      ${isModified && !isProcessing
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-slate-700 text-slate-500 cursor-not-allowed disabled:opacity-75'
                      }`}
                  >
                    <Download className="w-5 h-5" />
                    Télécharger l'image
                  </button>

                  {/* Bouton Réinitialiser (Fond noir, comme la maquette) */}
                  <button
                    onClick={handleReset}
                    disabled={!isModified || isProcessing}
                    aria-label="Réinitialiser l'image à sa version originale"
                    className="w-full bg-black hover:bg-slate-800 disabled:bg-slate-800/50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-base border border-slate-700"
                  >
                    <RotateCcw className="w-5 h-5" />
                    Réinitialiser
                  </button>
                  
                  {/* Bouton Nouvelle Image (Fond noir, comme la maquette) */}
                  <button
                    onClick={importNewImage}
                    disabled={isProcessing}
                    aria-label="Importer une nouvelle image"
                    className="w-full bg-black hover:bg-slate-800 disabled:bg-slate-800/50 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-base border border-slate-700"
                  >
                    <Upload className="w-5 h-5" />
                    Nouvelle image
                  </button>
                </div>
              </div>
            </div>
            {/* Section Comment ça Marche ? - TOUJOURS EN BAS */}
            <HowItWorksBlock />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;