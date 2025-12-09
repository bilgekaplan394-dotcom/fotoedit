import React, { useState, useRef, useEffect, useCallback } from 'react';

// Temel renkler ve stil tanımları
const primaryColor = 'cyan';
const primaryHex = '#06b6d4'; // cyan-500
// Örnek görsel URL'si tamamen kaldırıldı.
const SAMPLE_IMAGE_URL = ''; 

// Yardımcı Bileşen: Kaydırıcı Kontrolü
const SliderControl = ({ id, label, value, min, max, step, unit = '%', onChange }) => (
    <div className="space-y-1">
        <div className="flex justify-between text-xs text-slate-400">
            <span>{label}</span>
            <span className={`text-${primaryColor}-400 font-bold`}>{value}{unit}</span>
        </div>
        <input 
            type="range" 
            id={id} 
            min={min} 
            max={max} 
            value={value} 
            step={step} 
            // Koyu temaya uygun kaydırıcı stili
            className={`w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-${primaryColor}-500`} 
            onInput={onChange}
        />
    </div>
);

// Yardımcı Bileşen: Filtre Butonu
const FilterButton = ({ label, filter, currentFilter, onClick, activeClass }) => (
    <button 
        className={`p-2 rounded-lg text-xs border transition-colors shadow-md transform hover:scale-[1.02] ${currentFilter === filter ? activeClass : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`} 
        onClick={() => onClick(filter)}
    >
        {label}
    </button>
);

// Gölge Sınıflarını Tailwind Shadow'a Eşleştirme
const getShadowClass = (level) => {
    const shadows = [
        'shadow-none',
        'shadow-sm',
        'shadow-md',
        'shadow-xl',
        'shadow-2xl',
        'shadow-[0_35px_60px_-15px_rgba(0,0,0,0.6)]', // Ekstra belirgin gölge
    ];
    return shadows[level] || shadows[0]; // 0-5 arası değerler için
};


const App = () => {
    const canvasRef = useRef(null);
    const bgInputRef = useRef(null); // Yeni: Arka plan görseli için
    const [originalImage, setOriginalImage] = useState(null); 
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [currentFilter, setCurrentFilter] = useState('none');
    const [message, setMessage] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    
    const [isDragging, setIsDragging] = useState(false); 

    const [settings, setSettings] = useState({
        brightness: 100,
        contrast: 100,
        saturate: 100,
        rotation: 0,
        scale: 1.0, // Zoom geri geldi
        panX: 0, 
        panY: 0, 
        // Yeni Özellikler
        shadow: 3, 
        shadowColor: '#000000', 
        shadowOffsetX: 0, 
        shadowOffsetY: 15, 
        borderRadius: 12, 
        watermarkText: 'SnapPolish',
        watermarkColor: '#ffffff', 
        watermarkSize: 1.0, 
        showWatermark: true,
        // Arka Plan Özellikleri
        padding: 40, 
        background: 'linear-gradient(135deg, #1e3a8a 0%, #171717 100%)', 
        bgType: 'gradient', 
        customBackground: null, 
        // Yeni Boyutlandırma Özelliği
        aspectRatio: 'auto',
        // Tuning
        blur: 0, 
        
        // METİN VE KIRPMA İÇİN YENİ AYARLAR
        crop: { x: 0, y: 0, width: 100, height: 100 }, // Yüzde olarak
        textOverlay: { content: 'Your Caption Here', color: '#ffffff', size: 24, x: 50, y: 50, rotation: 0 },
        showText: false,
        
        // YENİ: FIT MODE
        fitMode: 'contain', // 'contain' (boşluk bırakır) veya 'cover' (doldurur)
    });
    
    const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    const [bgImageObject, setBgImageObject] = useState(null);

    const aspectOptions = [
        { label: 'Auto', value: 'auto' },
        { label: '1:1', value: '1 / 1' },
        { label: '16:9', value: '16 / 9' },
        { label: '4:5', value: '4 / 5' },
    ];


    /** Show message box */
    const showMessage = useCallback((text) => {
        setMessage(text);
        setTimeout(() => setMessage(''), 4000);
    }, []);

    /** Calculate CSS filter string */
    const getCurrentFilterStyle = useCallback(() => {
        const { brightness, contrast, saturate, blur } = settings;
        let filterString = '';

        if (currentFilter !== 'none') {
            filterString += `${currentFilter} `;
        }

        filterString += `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${blur}px)`; 
        
        return filterString.trim();
    }, [settings, currentFilter]);
    
    /** Calculate CSS background style for the preview container */
    const getBackgroundStyle = useCallback(() => {
        if (settings.bgType === 'image' && settings.customBackground) {
            return {
                backgroundImage: `url(${settings.customBackground})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            };
        }
        // NOTE: Burada arka plan rengini/gradyanını uyguluyoruz.
        return { background: settings.background };
    }, [settings.bgType, settings.customBackground, settings.background]);


    /**
     * Draws a rounded rectangle path on the canvas context.
     */
    const roundRect = useCallback((ctx, x, y, width, height, radius) => {
        if (width < 2 * radius) radius = width / 2;
        if (height < 2 * radius) radius = height / 2;
        
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        ctx.lineTo(x + radius, y + height);
        ctx.arcTo(x, y + height, x, y + height - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    }, []);


    /** Canvas Gradyan Çizim Mantığı */
    const drawGradient = useCallback((ctx, colorString, width, height) => {
        const match = colorString.match(/linear-gradient\(([^,]+), ([^,]+) 0%, ([^)]+) 100%\)/);
        if (match) {
            const [, angleStr, color1, color2] = match;
            const gradient = ctx.createLinearGradient(0, 0, width, height); 
            gradient.addColorStop(0, color1.trim());
            gradient.addColorStop(1, color2.trim());
            
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);
        } else {
            ctx.fillStyle = colorString.includes('#') ? colorString : '#1e293b'; 
            ctx.fillRect(0, 0, width, height);
        }
    }, []);


    /** Canvas Drawing Logic */
    const updateDisplay = useCallback(() => {
        if (!isImageLoaded || !originalImage || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { rotation, scale, panX, panY, borderRadius, crop, fitMode } = settings; 

        canvas.style.filter = getCurrentFilterStyle();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const containerWidth = canvas.width;
        const containerHeight = canvas.height;

        const radians = rotation * Math.PI / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        
        // Görüntü boyutlarını kırpma oranlarına göre hesapla
        const croppedWidth = originalImage.width * (crop.width / 100);
        const croppedHeight = originalImage.height * (crop.height / 100);

        const projectionWidth = (croppedWidth * cos) + (croppedHeight * sin);
        const projectionHeight = (croppedWidth * sin) + (croppedHeight * cos);

        let fitScaleX = containerWidth / projectionWidth;
        let fitScaleY = containerHeight / projectionHeight;
        
        // DÜZELTME: Fit moduna göre ölçekleme
        let fitScale = fitMode === 'contain' ? Math.min(fitScaleX, fitScaleY) : Math.max(fitScaleX, fitScaleY);

        // --- DRAWING START ---
        
        ctx.save();
        
        // 1. ROTATION AND TRANSFORMATION
        ctx.translate(containerWidth / 2, containerHeight / 2);
        ctx.rotate(radians);
        ctx.scale(fitScale * scale, fitScale * scale); 
        ctx.translate(panX, panY); 
        
        const drawWidth = croppedWidth;
        const drawHeight = croppedHeight;
        
        // 2. ROUNDED CORNER MASKING
        roundRect(ctx, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight, borderRadius / (fitScale * scale)); 
        ctx.clip(); 

        // 3. DRAW IMAGE (Kırpma önizlemesi için drawImage'in 9 parametreli versiyonu)
        const sourceX = originalImage.width * (crop.x / 100);
        const sourceY = originalImage.height * (crop.y / 100);
        
        ctx.drawImage(
            originalImage, 
            sourceX, sourceY, // Source X, Y
            drawWidth, drawHeight, // Source Width, Height
            -drawWidth / 2, -drawHeight / 2, // Destination X, Y (Merkezlenmiş)
            drawWidth, drawHeight // Destination Width, Height
        );
        
        ctx.restore();
        // --- DRAWING END ---

    }, [isImageLoaded, originalImage, settings, getCurrentFilterStyle, roundRect]);

    // Effect: Update display on setting/filter changes
    useEffect(() => {
        updateDisplay();
    }, [settings, currentFilter, updateDisplay]);
    
    // Effect: Load Sample Image on initial mount (TAMAMEN KALDIRILDI)
    useEffect(() => {
        // Sample görsel yükleme lojiği kaldırıldı. Kullanıcı yükleyince başlar.
    }, [isImageLoaded, originalImage, updateDisplay]);


    /** Handle main and background image upload */
    const handleImageUpload = (event, target = 'main') => {
        const file = event.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            showMessage('Error: Image size must be less than 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const result = e.target?.result;
            if (!result) return;
            
            if (target === 'main') {
                const img = new Image();
                img.onload = () => {
                    setOriginalImage(img);
                    setIsImageLoaded(true);
                    
                    const containerDiv = canvasRef.current.parentNode;
                    canvasRef.current.width = containerDiv.clientWidth;
                    canvasRef.current.height = containerDiv.clientHeight;

                    setSettings(prev => ({ ...prev, rotation: 0, scale: 1.0, panX: 0, panY: 0, crop: { x: 0, y: 0, width: 100, height: 100 } }));
                    setCurrentFilter('none');
                    showMessage('Photo uploaded successfully!');
                };
                img.onerror = () => {
                    showMessage('Error: Image could not be loaded.');
                };
                img.src = result;
            } else if (target === 'background') {
                const bgImg = new Image();
                bgImg.crossOrigin = "anonymous"; // CORS'u etkinleştir
                bgImg.onload = () => {
                    setBgImageObject(bgImg);
                    setSettings(prev => ({ 
                        ...prev, 
                        customBackground: result, 
                        bgType: 'image',
                        background: 'transparent'
                    }));
                    showMessage('Background image uploaded!');
                };
                bgImg.onerror = () => {
                     showMessage('Error: Background image could not be loaded.');
                }
                bgImg.src = result;
            }
        };
        reader.readAsDataURL(file);
    };

    /** Handle all slider input changes */
    const handleSliderChange = (e) => {
        const { id, value } = e.target;
        const intValue = parseInt(value, 10);
        
        if (id === 'borderRadius' || id === 'shadow' || id === 'padding' || id === 'blur') {
             setSettings(prev => ({ ...prev, [id]: intValue }));
        } 
        else if (id === 'shadowOffsetX' || id === 'shadowOffsetY') { 
            setSettings(prev => ({ ...prev, [id]: intValue }));
        }
        else if (id === 'textOverlaySize' || id === 'textOverlayX' || id === 'textOverlayY' || id === 'textOverlayRotation') { // Rotation eklendi
            const prop = id.replace('textOverlay', '').toLowerCase();
            setSettings(prev => ({ ...prev, textOverlay: { ...prev.textOverlay, [prop]: intValue } }));
        }
        else if (id === 'scale') { // Zoom geri geldi
            const scaleMultiplier = parseFloat(value) / 100;
            setSettings(prev => ({ ...prev, scale: scaleMultiplier }));
        } 
        else if (id.startsWith('crop')) {
            const prop = id.replace('crop', '').toLowerCase(); 
            // DÜZELTME: Crop W ve H değerlerinin 100'ü geçmesini engelle
            let finalValue = intValue;
            
            setSettings(prev => { 
                if (prop === 'width' && prev.crop.x + intValue > 100) {
                    finalValue = 100 - prev.crop.x;
                } else if (prop === 'height' && prev.crop.y + intValue > 100) {
                    finalValue = 100 - prev.crop.y;
                }
                
                return { 
                    ...prev, 
                    crop: { ...prev.crop, [prop]: finalValue } 
                };
            });
        }
        else {
            setSettings(prev => ({ ...prev, [id]: parseFloat(value) }));
        }
    };
    
    /** Handle color input changes */
    const handleColorChange = (e) => {
        const { id, value } = e.target;
        if (id === 'watermarkColor') {
             setSettings(prev => ({ ...prev, watermarkColor: value }));
        }
        else if (id === 'textOverlayColor') {
             setSettings(prev => ({ ...prev, textOverlay: { ...prev.textOverlay, color: value } }));
        }
        else {
             setSettings(prev => ({ ...prev, [id]: value }));
        }
    };

    
    /** Handle fit mode toggle */
    const handleFitModeChange = (mode) => {
        setSettings(prev => ({ ...prev, fitMode: mode }));
    };


    /** Handle text input changes */
    const handleTextChange = (e) => {
        const { id, value } = e.target;
        if (id === 'textOverlayContent') {
             setSettings(prev => ({ ...prev, textOverlay: { ...prev.textOverlay, content: value } }));
        } else {
             setSettings(prev => ({ ...prev, [id]: value }));
        }
    };

    /** Handle preset background selection */
    const handleBackgroundSelection = (colorOrGradient) => {
        setBgImageObject(null); 
        setSettings(prev => ({ 
            ...prev, 
            background: colorOrGradient, 
            bgType: colorOrGradient.includes('gradient') ? 'gradient' : 'solid',
            customBackground: null 
        }));
    };

    /** Handle aspect ratio change */
    const handleAspectRatioChange = (ratio) => {
        setSettings(prev => ({ ...prev, aspectRatio: ratio }));
    };


    /** Apply color filters */
    const applyFilter = (filter) => {
        setCurrentFilter(filter);
    };

    /** Reset all adjustments */
    const resetAdjustments = () => {
        setSettings({ 
            brightness: 100, 
            contrast: 100, 
            saturate: 100, 
            rotation: 0, 
            tiltX: 0, 
            tiltY: 0, 
            scale: 1.0, 
            panX: 0, 
            panY: 0,
            shadow: 3,
            shadowColor: '#000000', // RESET
            shadowOffsetX: 0, // RESET
            shadowOffsetY: 0, // RESET
            borderRadius: 12,
            watermarkText: 'Pro Polish',
            watermarkColor: '#ffffff', // RESET
            watermarkSize: 1.0, // RESET
            showWatermark: true,
            padding: 40,
            background: 'linear-gradient(135deg, #1e3a8a 0%, #171717 100%)',
            bgType: 'gradient',
            customBackground: null,
            aspectRatio: 'auto',
            blur: 0,
            crop: { x: 0, y: 0, width: 100, height: 100 },
            textOverlay: { content: 'Your Caption Here', color: '#ffffff', size: 24, x: 50, y: 50, rotation: 0 },
            showText: false,
            fitMode: 'contain',
        });
        setCurrentFilter('none');
        setBgImageObject(null);
        showMessage('Adjustments reset.');
    };

    /** Download final image (High Resolution) */
    const downloadImage = () => {
    if (!isImageLoaded || isDownloading) {
        showMessage('Please upload a photo first.');
        return;
    }

    setIsDownloading(true);
    const finalCanvas = document.createElement('canvas');
    const finalCtx = finalCanvas.getContext('2d');

    const originalWidth = originalImage.naturalWidth;
    const originalHeight = originalImage.naturalHeight;

    // --- CROP'U GÜVENLİ HALE GETİR ---
    let cropXPercent = Math.max(0, Math.min(100, settings.crop.x));
    let cropYPercent = Math.max(0, Math.min(100, settings.crop.y));
    let cropWPercent = Math.max(1, Math.min(100, settings.crop.width));
    let cropHPercent = Math.max(1, Math.min(100, settings.crop.height));

    if (cropXPercent + cropWPercent > 100) {
        cropWPercent = 100 - cropXPercent;
    }
    if (cropYPercent + cropHPercent > 100) {
        cropHPercent = 100 - cropYPercent;
    }

    const cropW = (cropWPercent / 100) * originalWidth;
    const cropH = (cropHPercent / 100) * originalHeight;
    const cropX = (cropXPercent / 100) * originalWidth;
    const cropY = (cropYPercent / 100) * originalHeight;

    const radians = settings.rotation * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));

    // --- ÖNİZLEME CANVAS BOYUTUNU KULLAN (fitMode ile aynı olacak) ---
    const previewCanvas = canvasRef.current;
    let containerWidth = cropW;
    let containerHeight = cropH;

    if (previewCanvas) {
        containerWidth = previewCanvas.width;
        containerHeight = previewCanvas.height;
    }

    // Önizlemede kullanılan "croppedWidth/Height" zaten cropW/cropH
    const projectionWidth = (cropW * cos) + (cropH * sin);
    const projectionHeight = (cropW * sin) + (cropH * cos);

    let fitScaleX = containerWidth / projectionWidth;
    let fitScaleY = containerHeight / projectionHeight;
    let fitScale =
        settings.fitMode === 'contain'
            ? Math.min(fitScaleX, fitScaleY)
            : Math.max(fitScaleX, fitScaleY);

    const effectiveScale = fitScale * settings.scale;

    // Bu ölçekte döndürülmüş görüntünün bounding box'ı:
    const innerWidth = (cropW * effectiveScale * cos) + (cropH * effectiveScale * sin);
    const innerHeight = (cropW * effectiveScale * sin) + (cropH * effectiveScale * cos);

    // --- ÇIKTI ÇERÇEVESİ ---
    const finalPadding = settings.padding * 2;
    let outputWidth = innerWidth + finalPadding;
    let outputHeight = innerHeight + finalPadding;

    // Aspect ratio zorlaması
    if (settings.aspectRatio !== 'auto') {
        const [wRatio, hRatio] = settings.aspectRatio.split(' / ').map(Number);
        const ratioValue = wRatio / hRatio;

        if (outputWidth / outputHeight > ratioValue) {
            outputHeight = outputWidth / ratioValue;
        } else {
            outputWidth = outputHeight * ratioValue;
        }
    }

    finalCanvas.width = Math.round(outputWidth);
    finalCanvas.height = Math.round(outputHeight);

    // 1. ARKA PLAN
    finalCtx.save();
    finalCtx.resetTransform();

    if (settings.bgType === 'image' && bgImageObject) {
        finalCtx.drawImage(bgImageObject, 0, 0, finalCanvas.width, finalCanvas.height);
    } else if (settings.bgType === 'gradient' && settings.background.includes('linear-gradient')) {
        drawGradient(finalCtx, settings.background, finalCanvas.width, finalCanvas.height);
    } else {
        let bgColor;
        if (settings.background.includes('#f05053')) {
            bgColor = '#f05053';
        } else if (settings.background.includes('gradient')) {
            bgColor = '#1e293b';
        } else {
            bgColor =
                settings.background.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/)?.[0] ||
                '#1e293b';
        }
        finalCtx.fillStyle = bgColor;
        finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
    }
    finalCtx.restore();

    // İç alanın merkezi
    const contentCenterX = finalCanvas.width / 2;
    const contentCenterY = finalCanvas.height / 2;

    // 2. GÖRÜNTÜYÜ ÇİZ (Önizleme ile aynı filter & scale & radius)
    finalCtx.save();

    // Aynı filter string (aggressiveBlur yok artık)
    finalCtx.filter = getCurrentFilterStyle();

    const { panX, panY } = settings;

    finalCtx.translate(contentCenterX, contentCenterY);
    finalCtx.rotate(radians);
    finalCtx.scale(effectiveScale, effectiveScale);
    finalCtx.translate(panX, panY);

    finalCtx.save();
    // Radius: önizlemedeki gibi effectiveScale'e göre
    const radius = settings.borderRadius / effectiveScale;
    roundRect(finalCtx, -cropW / 2, -cropH / 2, cropW, cropH, radius);
    finalCtx.clip();

    finalCtx.drawImage(
        originalImage,
        cropX,
        cropY,
        cropW,
        cropH,
        -cropW / 2,
        -cropH / 2,
        cropW,
        cropH
    );

    finalCtx.restore(); // mask
    finalCtx.restore(); // transform

        // 3. WATERMARK (önizlemedeki pill’e benzer)
    if (settings.showWatermark && settings.watermarkText) {
        finalCtx.save();

        const text = settings.watermarkText || '';
        
        // Önizlemede text-xs ≈ 12px, biraz büyük ve ölçeklenebilir olsun:
        const baseFontSize = 14; // px
        const scaledFontSize = baseFontSize * (settings.watermarkSize || 1);
        finalCtx.font = `600 ${scaledFontSize}px Inter, system-ui, sans-serif`;
        finalCtx.textAlign = 'center';
        finalCtx.textBaseline = 'middle';

        const textMetrics = finalCtx.measureText(text);
        const textWidth = textMetrics.width;

        // Tailwind px-3 py-1.5 ≈ 12px yatay, 6px dikey
        const paddingX = 12;
        const paddingY = 6;

        const pillWidth = textWidth + paddingX * 2;
        const pillHeight = scaledFontSize + paddingY * 2;

        // bottom-4 right-4 → yaklaşık 16px
        const margin = 16;

        // İç kutunun (inner container) sağ altından konumla:
        const pillX = finalCanvas.width - settings.padding - margin - pillWidth;
        const pillY = finalCanvas.height - settings.padding - margin - pillHeight;

        const pillRadius = pillHeight / 2;

        // Arka plan (bg-black/50)
        finalCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        roundRect(finalCtx, pillX, pillY, pillWidth, pillHeight, pillRadius);
        finalCtx.fill();

        // İnce border (border-white/10)
        finalCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        finalCtx.lineWidth = 1;
        roundRect(finalCtx, pillX, pillY, pillWidth, pillHeight, pillRadius);
        finalCtx.stroke();

        // Metin (text-white)
        const centerX = pillX + pillWidth / 2;
        const centerY = pillY + pillHeight / 2;
        finalCtx.fillStyle = settings.watermarkColor || '#ffffff';
        finalCtx.fillText(text, centerX, centerY);

        finalCtx.restore();
    }


    // 4. TEXT OVERLAY (inner area'ya göre konumlandır)
    if (settings.showText && settings.textOverlay.content) {
        finalCtx.save();

        const textContent = settings.textOverlay.content;
        const size = settings.textOverlay.size;
        const color = settings.textOverlay.color;

        // İç alandan padding'i çıkar, yüzdeyi oraya uygula
        const innerWidthForText =
            finalCanvas.width - 2 * settings.padding;
        const innerHeightForText =
            finalCanvas.height - 2 * settings.padding;

        const xPos =
            settings.padding + (innerWidthForText * settings.textOverlay.x) / 100;
        const yPos =
            settings.padding + (innerHeightForText * settings.textOverlay.y) / 100;

        finalCtx.font = `bold ${size}px Inter, sans-serif`;
        finalCtx.fillStyle = color;
        finalCtx.textAlign = 'center';
        finalCtx.textBaseline = 'middle';

        finalCtx.translate(xPos, yPos);
        finalCtx.rotate(settings.textOverlay.rotation * Math.PI / 180);
        finalCtx.fillText(textContent, 0, 0);

        finalCtx.restore();
    }

    const dataURL = finalCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'edited_photo.png';
    document.body.appendChild(a);

    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
    }, 100);

    setIsDownloading(false);
    showMessage('Download started.');
};


    // --- Pan/Zoom Event Handlers ---
    
    const handleMouseDown = (e) => {};
    const handleMouseMove = (e) => {};
    const handleMouseUp = () => {};
    const handleWheel = (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();
    };
    
    // Responsive update effect
    useEffect(() => {
        const handleResize = () => {
            if (!isImageLoaded || !canvasRef.current) return;

            // Canvas'ın bulunduğu container
            const containerDiv = canvasRef.current.parentElement;
            const rect = containerDiv.getBoundingClientRect();

            canvasRef.current.width = rect.width;
            canvasRef.current.height = rect.height;

            updateDisplay();
        };

        // ÖNEMLİ: aspectRatio / padding değiştiği AN hemen çalıştır
        handleResize();

        // Pencere yeniden boyutlanınca da çalışsın
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isImageLoaded, updateDisplay, settings.aspectRatio, settings.padding]);


    const controlPanelClasses = isImageLoaded ? 'p-4 rounded-xl border border-slate-800 bg-slate-800/70 shadow-lg' : 'p-4 rounded-xl border border-slate-800 bg-slate-800/70 shadow-lg opacity-50 pointer-events-none';

    return (
        <div className="h-screen w-full bg-slate-950 text-slate-200 font-sans flex flex-col md:flex-row overflow-hidden">
            
            {/* --- CONTROLS / LEFT PANEL --- */}
            <div className="md:w-72 w-full bg-slate-900 border-r border-slate-800 flex flex-col z-30 shadow-2xl overflow-y-auto custom-scrollbar order-2 md:order-none max-h-[50vh] md:max-h-full">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className="bg-gradient-to-tr from-cyan-500 to-blue-500 p-2 rounded-lg text-white">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10h.01M19 18H5a2 2 0 01-2-2V8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2z" /></svg>
                        </div>
                        <h1 className="font-bold text-lg text-white">Pro Image Editor</h1>
                    </div>
                </div>

                {/* Control Sections */}
                <div className="p-4 space-y-6 flex-1">
                    
                    {/* Upload Button */}
                    <input type="file" id="imageUploader" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'main')}/>
                    <button onClick={() => document.getElementById('imageUploader').click()} 
                            className={`w-full flex items-center justify-center px-6 py-3 border border-transparent text-sm font-semibold rounded-lg shadow-lg text-white bg-green-600 hover:bg-green-700 transition duration-150 transform hover:scale-[1.01]`} 
                    >
                        <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10h.01M19 18H5a2 2 0 01-2-2V8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2z" /></svg>
                        Upload Photo
                    </button>
                    
                    {/* View and Background Settings */}
                    <section id="backgroundControls" className={controlPanelClasses}>
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">View & Background</h2>
                        <div className="space-y-4">
                            
                            {/* Aspect Ratio Control */}
                             <div>
                                <label className="text-xs font-bold text-slate-400 block mb-1">Aspect Ratio</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {aspectOptions.map(opt => (
                                        <button 
                                            key={opt.value}
                                            onClick={() => handleAspectRatioChange(opt.value)}
                                            className={`py-1.5 text-xs rounded-lg border transition-colors ${
                                                settings.aspectRatio === opt.value
                                                    ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400'
                                                    : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            
                            <div className="flex justify-between items-center">
                                <label htmlFor="backgroundColor" className="text-xs font-bold text-slate-400">Background Color/Gradient</label>
                                <input
                                    type="color"
                                    id="backgroundColor"
                                    value={settings.background.includes('#') ? settings.background.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/)?.[0] || '#171717' : '#171717'}
                                    onChange={(e) => handleBackgroundSelection(e.target.value)}
                                    className="w-6 h-6 rounded-full border border-slate-600 bg-transparent cursor-pointer"
                                />
                            </div>
                             {/* Gradient/Color Palette */}
                             <div className="grid grid-cols-4 gap-2">
                                {['linear-gradient(135deg, #1e3a8a 0%, #171717 100%)', '#171717', 'linear-gradient(135deg, #f05053 0%, #d50000 100%)', '#0d9488'].map((bg, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleBackgroundSelection(bg)}
                                        className="h-8 rounded-md border border-slate-600 hover:scale-105 transition"
                                        style={{ background: bg }}
                                    />
                                ))}
                            </div>
                            
                            {/* Background Image Upload */}
                            <input type="file" id="bgImageUploader" ref={bgInputRef} accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'background')}/>
                            <button onClick={() => bgInputRef.current?.click()} 
                                    className={`w-full flex items-center justify-center px-6 py-2 border border-slate-700 text-xs font-semibold rounded-lg shadow-lg text-cyan-400 bg-slate-800 hover:bg-slate-700 transition duration-150 transform hover:scale-[1.01]`} 
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10h.01M19 18H5a2 2 0 01-2-2V8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2z" /></svg>
                                Upload BG Image
                            </button>

                            <SliderControl 
                                id="padding" 
                                label="Padding" 
                                value={settings.padding} 
                                min={0} 
                                max={100} 
                                step={5} 
                                unit="px" 
                                onChange={handleSliderChange} 
                            />
                            
                            {/* NEW: Fit Mode Toggle */}
                            <label className="text-xs font-bold text-slate-400 block mb-1">Image Fit Mode</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => handleFitModeChange('contain')}
                                    className={`py-1.5 text-xs rounded-lg border transition-colors ${
                                        settings.fitMode === 'contain'
                                            ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400'
                                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                                    }`}
                                >
                                    Contain (Fit)
                                </button>
                                <button
                                    onClick={() => handleFitModeChange('cover')}
                                    className={`py-1.5 text-xs rounded-lg border transition-colors ${
                                        settings.fitMode === 'cover'
                                            ? 'bg-cyan-900/50 border-cyan-500 text-cyan-400'
                                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'
                                    }`}
                                >
                                    Cover (Fill)
                                </button>
                            </div>
                        </div>
                    </section>
                    
                    {/* Style and Corner Settings */}
                    <section id="styleControls" className={controlPanelClasses}>
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Style & Corners</h2>
                        <div className="space-y-4">
                            <SliderControl 
                                id="shadow" 
                                label="Shadow Intensity" 
                                value={settings.shadow} 
                                min={0} 
                                max={5} 
                                step={1} 
                                unit="" 
                                onChange={handleSliderChange} 
                            />
                            <SliderControl 
                                id="borderRadius" 
                                label="Border Radius" 
                                value={settings.borderRadius} 
                                min={0} 
                                max={50} 
                                step={1} 
                                unit="px" 
                                onChange={handleSliderChange} 
                            />
                            <div className="flex items-center justify-between pt-2">
                                <label className="text-xs font-bold text-slate-400">Show Watermark</label>
                                <input
                                    type="checkbox"
                                    checked={settings.showWatermark}
                                    onChange={(e) => setSettings(prev => ({ ...prev, showWatermark: e.target.checked }))}
                                    className="accent-cyan-500 w-4 h-4"
                                />
                            </div>
                            {settings.showWatermark && (
                                <div>
                                    <label htmlFor="watermarkText" className="block text-xs text-slate-400 mb-1">Watermark Text</label>
                                    <input
                                        type="text"
                                        id="watermarkText"
                                        value={settings.watermarkText}
                                        onChange={handleTextChange}
                                        className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white placeholder-slate-500 focus:border-cyan-500 outline-none"
                                        placeholder="Your Brand Name"
                                    />
                                </div>
                            )}
                        </div>
                    </section>
                    
                    {/* NEW: Text Overlay Controls */}
                    <section id="textOverlayControls" className={controlPanelClasses}>
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Text Overlay</h2>

                        <div className="flex items-center justify-between">
                            <label className="text-xs font-bold text-slate-400">Show Text</label>
                            <input
                                type="checkbox"
                                checked={settings.showText}
                                onChange={(e) => setSettings(prev => ({ ...prev, showText: e.target.checked }))}
                                className="accent-cyan-500 w-4 h-4"
                            />
                        </div>

                        {settings.showText && (
                            <div className="space-y-3">
                                <input
                                    type="text"
                                    id="textOverlayContent"
                                    value={settings.textOverlay.content}
                                    onChange={handleTextChange}
                                    className="w-full bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-xs text-white"
                                    placeholder="Your caption"
                                />
                                <SliderControl 
                                    id="textOverlaySize" 
                                    label="Text Size" 
                                    value={settings.textOverlay.size} 
                                    min={10} 
                                    max={80} 
                                    step={1} 
                                    unit="px" 
                                    onChange={handleSliderChange} 
                                />
                                <SliderControl 
                                    id="textOverlayX" 
                                    label="X Position" 
                                    value={settings.textOverlay.x} 
                                    min={0} 
                                    max={100} 
                                    step={1} 
                                    unit="%" 
                                    onChange={handleSliderChange} 
                                />
                                <SliderControl 
                                    id="textOverlayY" 
                                    label="Y Position" 
                                    value={settings.textOverlay.y} 
                                    min={0} 
                                    max={100} 
                                    step={1} 
                                    unit="%" 
                                    onChange={handleSliderChange} 
                                />
                                <SliderControl 
                                    id="textOverlayRotation" 
                                    label="Rotation" 
                                    value={settings.textOverlay.rotation} 
                                    min={-45} 
                                    max={45} 
                                    step={1} 
                                    unit="°" 
                                    onChange={handleSliderChange} 
                                />
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-slate-400">Color</label>
                                    <input
                                        type="color"
                                        id="textOverlayColor"
                                        value={settings.textOverlay.color}
                                        onChange={handleColorChange}
                                        className="w-6 h-6 rounded-full border border-slate-600 bg-transparent cursor-pointer"
                                    />
                                </div>
                            </div>
                        )}
                    </section>


                    {/* Transformation Controls */}
                    <section id="rotationControls" className={controlPanelClasses}>
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Transforms & Zoom</h2>
                        <div className="space-y-3">
                             <SliderControl 
                                id="rotation" 
                                label="Rotation" 
                                value={settings.rotation} 
                                min={-180} 
                                max={180} 
                                step={1} 
                                unit="°" 
                                onChange={handleSliderChange} 
                            />
                            
                            {/* NEW: Zoom Slider geri geldi */}
                            <SliderControl 
                                id="scale" 
                                label="Zoom" 
                                value={settings.scale * 100} 
                                min={10} 
                                max={500} 
                                step={10} 
                                unit="%" 
                                onChange={handleSliderChange} 
                            />
                        </div>
                    </section>
                    
                    {/* NEW: Crop Controls */}
                    <section id="cropControls" className={controlPanelClasses}>
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Crop</h2>
                        <div className="space-y-3">
                            <SliderControl
                                id="cropX"
                                label="Crop X (Origin)"
                                value={settings.crop.x}
                                min={0}
                                max={100}
                                step={1}
                                unit="%"
                                onChange={handleSliderChange}
                            />
                             <SliderControl
                                id="cropY"
                                label="Crop Y (Origin)"
                                value={settings.crop.y}
                                min={0}
                                max={100}
                                step={1}
                                unit="%"
                                onChange={handleSliderChange}
                            />
                            <SliderControl
                                id="cropWidth"
                                label="Crop Width"
                                value={settings.crop.width}
                                min={10}
                                max={100}
                                step={1}
                                unit="%"
                                onChange={handleSliderChange}
                            />
                            <SliderControl
                                id="cropHeight"
                                label="Crop Height"
                                value={settings.crop.height}
                                min={10}
                                max={100}
                                step={1}
                                unit="%"
                                onChange={handleSliderChange}
                            />
                        </div>
                    </section>

                    {/* Filters */}
                    <section className="p-4 rounded-xl border border-slate-800 bg-slate-800/70 shadow-lg">
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Filters</h2>
                        <div className="grid grid-cols-2 gap-3">
                            <FilterButton 
                                label="Original" filter="none" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass={`bg-${primaryColor}-900/50 border-${primaryColor}-500 text-${primaryColor}-400 ring-2 ring-${primaryColor}-500/50`}
                            />
                            <FilterButton 
                                label="Grayscale" filter="grayscale(100%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-slate-500/50 border-slate-400 text-slate-200 ring-2 ring-slate-500/50"
                            />
                            <FilterButton 
                                label="Sepia" filter="sepia(100%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-amber-900/50 border-amber-500 text-amber-400 ring-2 ring-amber-500/50"
                            />
                            <FilterButton 
                                label="Invert" filter="invert(100%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-green-900/50 border-green-500 text-green-400 ring-2 ring-green-500/50"
                            />
                            
                            {/* NEW FILTERS */}
                             <FilterButton 
                                label="Hue 90°" filter="hue-rotate(90deg)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-violet-900/50 border-violet-500 text-violet-400 ring-2 ring-violet-500/50"
                            />
                            <FilterButton 
                                label="Saturate 200%" filter="saturate(200%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-red-900/50 border-red-500 text-red-400 ring-2 ring-red-500/50"
                            />
                            <FilterButton 
                                label="Contrast 150%" filter="contrast(150%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-blue-900/50 border-blue-500 text-blue-400 ring-2 ring-blue-500/50"
                            />
                            <FilterButton 
                                label="Drop Shadow" filter="drop-shadow(0 0 10px rgba(0,0,0,0.5))" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-yellow-900/50 border-yellow-500 text-yellow-400 ring-2 ring-yellow-500/50"
                            />
                            <FilterButton 
                                label="Vintage" filter="sepia(60%) contrast(120%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-orange-900/50 border-orange-500 text-orange-400 ring-2 ring-orange-500/50"
                            />
                            <FilterButton 
                                label="Warm" filter="hue-rotate(-15deg) contrast(110%)" currentFilter={currentFilter} onClick={applyFilter} 
                                activeClass="bg-pink-900/50 border-pink-500 text-pink-400 ring-2 ring-pink-500/50"
                            />
                        </div>
                    </section>

                    {/* Color Adjustments */}
                    <section id="adjustments" className={controlPanelClasses}>
                        <h2 className="text-sm font-bold text-cyan-400 mb-3 uppercase tracking-wider border-b border-slate-700 pb-2">Color Adjustments</h2>
                        <div className="space-y-4">
                            <SliderControl 
                                id="brightness" label="Brightness" value={settings.brightness} min={0} 
                                max={200} step={1} onChange={handleSliderChange} 
                            />
                            <SliderControl 
                                id="contrast" label="Contrast" value={settings.contrast} min={0} 
                                max={200} step={1} onChange={handleSliderChange} 
                            />
                            <SliderControl 
                                id="saturate" label="Saturation" value={settings.saturate} min={0} 
                                max={200} step={1} onChange={handleSliderChange} 
                            />
                            <SliderControl 
                                id="blur" label="Blur" value={settings.blur} min={0} 
                                max={10} step={1} unit="px" onChange={handleSliderChange} 
                            />

                            <button 
                                className="w-full py-2 px-4 border border-transparent text-xs font-medium rounded-lg shadow-md text-white bg-red-600 hover:bg-red-700 transition duration-150 transform hover:scale-[1.01]" 
                                onClick={resetAdjustments}>
                                Reset All
                            </button>
                        </div>
                    </section>
                </div>

                {/* Download Button */}
                <div className="p-4 border-t border-slate-800 bg-slate-900/50 flex gap-2">
                    <button 
                        onClick={downloadImage}
                        disabled={!isImageLoaded || isDownloading}
                        className="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition duration-150"
                    >
                        {isDownloading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10h.01M19 18H5a2 2 0 01-2-2V8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2z" /></svg>
                        )}
                        Download Image (PNG)
                    </button>
                </div>
            </div>

            {/* --- PHOTO PREVIEW / RIGHT AREA --- */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] order-1 md:order-none">
                
                {/* Preview Container (Relative) */}
                <div
                    // h-full kaldırıldı ki aspect ratio çalışsın
                    className={`relative transition-all duration-300 ease-out flex items-center justify-center overflow-hidden w-full max-w-[900px] max-h-[80vh] ${getShadowClass(settings.shadow)}`}
                    style={{
                         padding: `${settings.padding}px`, 
                         ...getBackgroundStyle(), 
                         overflow: 'hidden', 
                         aspectRatio: settings.aspectRatio === 'auto' ? 'auto' : settings.aspectRatio,
                    }}
                >
                    {/* Inner Container (Image/Canvas Wrapper) */}
                    <div
                        className="relative transition-all duration-300 w-full h-full" 
                        style={{
                            overflow: 'hidden',
                            borderRadius: `${settings.borderRadius}px`, // SADECE İÇ KUTU YUVARLAK
                        }}
                    >
                        {/* Canvas: The image itself */}
                        <canvas 
                            ref={canvasRef} 
                            className="max-w-full max-h-full block w-full h-full object-contain relative z-0"
                            style={{ cursor: 'default' }}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                            onWheel={handleWheel}
                        />
                        {!isImageLoaded && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-slate-500 p-4 z-10">
                                <svg className="w-12 h-12 text-cyan-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 18" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10h.01M19 18H5a2 2 0 01-2-2V8a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2z" /></svg>
                                <p className="mt-2 text-base font-medium">Focus on the viewing area.</p>
                                <p className="text-xs text-slate-600 mt-1">Upload a file from the left panel.</p>
                            </div>
                        )}

                        {/* Watermark Text (Must be above Canvas) */}
                        {isImageLoaded && settings.showWatermark && (
                            <div 
                                className="absolute bottom-4 right-4 z-30 pointer-events-none transition-all duration-300"
                                style={{ 
                                    borderRadius: `${settings.borderRadius}px`,
                                }}
                            >
                                <p className="text-white text-xs font-semibold px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm shadow-lg border border-white/10">
                                    {settings.watermarkText}
                                </p>
                            </div>
                        )}
                        
                        {/* YENİ: Metin Önizlemesi (Canvas'ın üzerinde) */}
                        {isImageLoaded && settings.showText && (
                            <div className="absolute inset-0 z-40 pointer-events-none flex items-center justify-center">
                                <div 
                                    style={{
                                        position: 'absolute',
                                        left: `${settings.textOverlay.x}%`,
                                        top: `${settings.textOverlay.y}%`,
                                        fontSize: `${settings.textOverlay.size}px`,
                                        color: settings.textOverlay.color,
                                        transform: `translate(-50%, -50%) rotate(${settings.textOverlay.rotation}deg)`,
                                        fontFamily: 'Inter, sans-serif',
                                        fontWeight: 'bold',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                    }}
                                >
                                    {settings.textOverlay.content}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Zoom Info */}
                {isImageLoaded && (
                    <div className="absolute top-8 right-8 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-full text-xs font-semibold border border-slate-700 text-cyan-400">
                        Zoom: {(settings.scale * 100).toFixed(0)}%
                    </div>
                )}
            </div>
        </div>
    );
};

export default App;