import React, { useState, useRef, useEffect, useCallback } from 'react';

// Temel renkler ve stil tanımları
const primaryColor = 'cyan';
const primaryHex = '#06b6d4'; // cyan-500
// Örnek görsel URL'si (Güvenilir placeholder ile değiştirildi)
const SAMPLE_IMAGE_URL = 'https://placehold.co/1200x800/1e293b/a5f3fc?text=Sample+Image&font=arial'; 

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
const FilterButton = ({ label, filter, currentFilter, onClick, activeClass }) => {
    const defaultClasses = `p-2 rounded-lg text-xs border transition-colors shadow-md transform hover:scale-[1.02]`;
    return (
        <button 
            className={`${defaultClasses} ${currentFilter === filter ? activeClass : 'bg-slate-700 border-slate-600 text-slate-300 hover:bg-slate-600'}`} 
            onClick={() => onClick(filter)}
        >
            {label}
        </button>
    );
};

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
    const [originalImage, setOriginalImage] = useState(null); // Başlangıçta null olacak, useEffect ile yüklenecek
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [currentFilter, setCurrentFilter] = useState('none');
    const [message, setMessage] = useState('');
    const [isDownloading, setIsDownloading] = useState(false);
    
    // isDragging state'i kaldırıldı
    const [isDragging, setIsDragging] = useState(false); 

    const [settings, setSettings] = useState({
        brightness: 100,
        contrast: 100,
        saturate: 100,
        rotation: 0,
        scale: 1.0, // Scale 1.0'da sabit tutuldu
        panX: 0, // Kaydırma (Pan) x değeri 
        panY: 0, // Kaydırma (Pan) y değeri
        // Yeni Özellikler
        shadow: 3, // 0'dan 5'e
        shadowColor: '#000000', // NEW
        shadowOffsetX: 0, // NEW
        shadowOffsetY: 0, // NEW
        borderRadius: 12, // px
        watermarkText: 'Pro Polish',
        watermarkColor: '#ffffff', // NEW
        watermarkSize: 1.0, // NEW
        showWatermark: true,
        // Arka Plan Özellikleri
        padding: 40, // Fotoğraf ile çerçeve arası boşluk
        background: 'linear-gradient(135deg, #1e3a8a 0%, #171717 100%)', // Varsayılan koyu gradyan
        bgType: 'gradient', // 'gradient', 'solid', 'image'
        customBackground: null, // Yüklenen görselin dataURL'si
        // Yeni Boyutlandırma Özelliği
        aspectRatio: 'auto', // 'auto', '1 / 1', '16 / 9', '4 / 5'
        // Tuning
        blur: 0, 
    });
    
    // dragStart ref'i kaldırıldı
    const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
    // Arka plan görselini tutmak için ayrı bir state tanımlayalım
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

        // DÜZELTME: Basit filtre (invert, grayscale, sepia) varsa önce onu ekle
        if (currentFilter !== 'none') {
            filterString += `${currentFilter} `;
        }

        // Renk ayarlamalarını ekle
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
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    }, []);


    /** Canvas Drawing Logic */
    const updateDisplay = useCallback(() => {
        if (!isImageLoaded || !originalImage || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const { rotation, scale, panX, panY, borderRadius } = settings;

        canvas.style.filter = getCurrentFilterStyle();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const containerWidth = canvas.width;
        const containerHeight = canvas.height;

        const radians = rotation * Math.PI / 180;
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        
        // Rotated bounding box projection (Prevents cropping of the rotated image)
        const projectionWidth = (originalImage.width * cos) + (originalImage.height * sin);
        const projectionHeight = (originalImage.width * sin) + (originalImage.height * cos);

        // Calculate fit scale to fit into the container
        let fitScaleX = containerWidth / projectionWidth;
        let fitScaleY = containerHeight / projectionHeight;
        let fitScale = Math.min(fitScaleX, fitScaleY);

        // --- DRAWING START ---
        
        ctx.save();
        
        // 1. ROTATION AND TRANSFORMATION
        ctx.translate(containerWidth / 2, containerHeight / 2);
        ctx.rotate(radians);
        ctx.scale(fitScale * scale, fitScale * scale); 
        ctx.translate(panX, panY); // Pan/Kaydırma uygulandı
        
        const drawWidth = originalImage.width;
        const drawHeight = originalImage.height;

        // 2. ROUNDED CORNER MASKING
        
        // Draw the rounded mask
        roundRect(ctx, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight, borderRadius / (fitScale * scale)); 
        ctx.clip(); // Apply the mask

        // 3. DRAW IMAGE
        ctx.drawImage(originalImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        
        ctx.restore();
        // --- DRAWING END ---

    }, [isImageLoaded, originalImage, settings, getCurrentFilterStyle, roundRect]);

    // Effect: Update display on setting/filter changes
    useEffect(() => {
        updateDisplay();
    }, [settings, currentFilter, updateDisplay]);
    
    // Effect: Load Sample Image on initial mount
    useEffect(() => {
        const loadSampleImage = () => {
            if (originalImage === null && !isImageLoaded) {
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    setOriginalImage(img);
                    setIsImageLoaded(true);
                    
                    // Set initial canvas size
                    if (canvasRef.current) {
                        const containerDiv = canvasRef.current.parentNode;
                        canvasRef.current.width = containerDiv.clientWidth;
                        canvasRef.current.height = containerDiv.clientHeight;
                        updateDisplay(); // İlk çizimi tetikle
                    }
                };
                img.onerror = () => {
                    console.error("Sample image failed to load.");
                };
                img.src = SAMPLE_IMAGE_URL;
            }
        };
        loadSampleImage();
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

                    setSettings(prev => ({ ...prev, rotation: 0, scale: 1.0, panX: 0, panY: 0 }));
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
        
        // Kaldırılan Zoom özelliğine ait lojik kaldırıldı.
        if (id === 'borderRadius' || id === 'shadow' || id === 'padding' || id === 'blur') {
             setSettings(prev => ({ ...prev, [id]: parseInt(value, 10) }));
        } 
        else if (id === 'shadowOffsetX' || id === 'shadowOffsetY' || id === 'panX' || id === 'panY') { // PanX/Y için NEW
            setSettings(prev => ({ ...prev, [id]: parseInt(value, 10) }));
        }
        else {
            setSettings(prev => ({ ...prev, [id]: parseFloat(value) }));
        }
    };
    
    /** Handle color input changes */
    const handleColorChange = (e) => {
        const { id, value } = e.target;
        setSettings(prev => ({ ...prev, [id]: value }));
    };


    /** Handle text input changes */
    const handleTextChange = (e) => {
        const { id, value } = e.target;
        setSettings(prev => ({ ...prev, [id]: value }));
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
        const radians = settings.rotation * Math.PI / 180;
        
        // Calculate the bounding box of the rotated image content
        const cos = Math.abs(Math.cos(radians));
        const sin = Math.abs(Math.sin(radians));
        const finalCanvasWidth = Math.ceil((originalWidth * cos) + (originalHeight * sin));
        const finalCanvasHeight = Math.ceil((originalWidth * sin) + (originalHeight * cos));
        
        // --- CALCULATE OUTPUT FRAME SIZE ---
        const finalPadding = settings.padding * 2; 
        let outputWidth = finalCanvasWidth + finalPadding;
        let outputHeight = finalCanvasHeight + finalPadding;

        // Apply Aspect Ratio Constraint to Output
        if (settings.aspectRatio !== 'auto') {
            const [wRatio, hRatio] = settings.aspectRatio.split(' / ').map(Number);
            const ratioValue = wRatio / hRatio;
            
            if (outputWidth / outputHeight > ratioValue) {
                outputHeight = outputWidth / ratioValue;
            } else {
                outputWidth = outputHeight * ratioValue;
            }
        }
        
        finalCanvas.width = outputWidth;
        finalCanvas.height = outputHeight;

        // 1. Draw Background
        finalCtx.save();
        finalCtx.resetTransform();

        // DÜZELTME: Kırmızı gradyan için rengi ayarla
        let bgColor;
        if (settings.bgType === 'image' && bgImageObject) {
            finalCtx.drawImage(bgImageObject, 0, 0, outputWidth, outputHeight);
        } else {
            if (settings.background.includes('#f05053')) { // Kırmızı gradyan tespiti
                bgColor = '#f05053'; 
            } else if (settings.background.includes('gradient')) {
                bgColor = '#1e293b'; 
            } else {
                bgColor = settings.background.match(/#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})/)?.[0] || '#1e293b';
            }
            finalCtx.fillStyle = bgColor;
            finalCtx.fillRect(0, 0, outputWidth, outputHeight); 
        }
        finalCtx.restore();

        // Content Center (after padding)
        const contentCenterX = outputWidth / 2;
        const contentCenterY = outputHeight / 2;

        
        // --- DRAW IMAGE WITH TRANSFORMS ---
        // Uygulanan filtreleri içeren save bloğu
        finalCtx.save();
        
        // DÜZELTME 1: BLUR filtresini 4 kat artırarak tarayıcı hafifletmesini dengele.
        const { brightness, contrast, saturate, blur, shadowOffsetX, shadowOffsetY } = settings;
        const aggressiveBlur = blur * 4; // Blur çarpanı 4 olarak korundu.
        
        // DÜZELTME: Filtreleri oluştururken basit filtreyi ekle
        let finalFilterString = '';
        if (currentFilter !== 'none') {
            finalFilterString += `${currentFilter} `; 
        }
        finalFilterString += `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) blur(${aggressiveBlur}px)`;
        
        finalCtx.filter = finalFilterString; 

        // DÜZELTME 2: Border Radius'u 4 kat artırarak belirgin yapalım.
        const baseRadius = settings.borderRadius * 4; 

        finalCtx.translate(contentCenterX, contentCenterY);
        finalCtx.rotate(radians);
        
        // --- BLUR KENAR DOLDURMA (Kaldırıldı) ---
        // Manuel doldurma loğiği kaldırıldı.

        // Apply Rounding Mask 
        finalCtx.save(); // Maske için yeni bir save durumu
        roundRect(
            finalCtx, 
            (-originalWidth / 2), 
            (-originalHeight / 2), 
            originalWidth, 
            originalHeight, 
            baseRadius 
        );
        finalCtx.clip(); // Maskeyi uygula
        
        // Draw Image (Görsel çizimi)
        finalCtx.drawImage(
            originalImage, 
            (-originalWidth / 2) + settings.panX, // PanX uygulandı
            (-originalImage.naturalHeight / 2) + settings.panY, // PanY uygulandı
            originalWidth, 
            originalHeight
        );

        finalCtx.restore(); // Maske save/restore edildi
        finalCtx.restore(); // Ana transformasyon save/restore edildi

        // Draw Watermark (Filtresiz ve belirgin olmalı)
        if (settings.showWatermark && settings.watermarkText) {
            
            finalCtx.save(); // Filigran çizimi için yeni save
            
            const scaledFontSize = 32 * settings.watermarkSize; // NEW: Font boyutunu ölçeklendir
            finalCtx.font = `bold ${scaledFontSize}px sans-serif`; 
            finalCtx.fillStyle = settings.watermarkColor; // NEW: Filigran rengi
            finalCtx.textAlign = 'right';
            finalCtx.textBaseline = 'bottom';
            
            finalCtx.fillText(
                settings.watermarkText, 
                outputWidth - 40, 
                outputHeight - 40 
            );

            finalCtx.restore(); // Filigran çizimi bitti
        }


        const dataURL = finalCanvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataURL;
        a.download = 'edited_photo.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setIsDownloading(false);
        showMessage('Download started.');
    };

    // --- Pan/Zoom Event Handlers ---
    
    // Pan özelliğine ait tüm fonksiyonlar kaldırıldı
    const handleMouseDown = (e) => {
        // Pan özelliği kaldırıldığı için boş bırakıldı
    };

    const handleMouseMove = (e) => {
        // Pan özelliği kaldırıldığı için boş bırakıldı
    };

    const handleMouseUp = () => {
        // Pan özelliği kaldırıldığı için boş bırakıldı
    };

    const handleWheel = (e) => {
        if (!isImageLoaded) return;
        e.preventDefault();
        // Zoom özelliği kaldırıldığı için, wheel event'i artık sadece kaydırma yapacaktır.
    };
    
    // Responsive update effect
    useEffect(() => {
        const handleResize = () => {
            if (isImageLoaded && canvasRef.current) {
                const containerDiv = canvasRef.current.parentNode;
                canvasRef.current.width = containerDiv.clientWidth;
                canvasRef.current.height = containerDiv.clientHeight;
                updateDisplay();
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isImageLoaded, updateDisplay]);


    const controlPanelClasses = isImageLoaded ? 'p-4 rounded-xl border border-slate-800 bg-slate-800/70 shadow-lg' : 'p-4 rounded-xl border border-slate-800 bg-slate-800/70 shadow-lg opacity-50 pointer-events-none';

    return (
        <div className="h-screen w-full bg-slate-950 text-slate-200 font-sans flex flex-col md:flex-row overflow-hidden">
            
            {/* --- CONTROLS / LEFT PANEL --- */}
            {/* Mobil görünümde aşağıda kalmalı (order-2) */}
            <div className="md:w-72 w-full bg-slate-900 border-r border-slate-800 flex flex-col z-30 shadow-2xl overflow-y-auto custom-scrollbar order-2 md:order-none max-h-[50vh] md:max-h-full">
                
                {/* Header */}
                <div className="p-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <div className="bg-gradient-to-tr from-cyan-500 to-blue-500 p-2 rounded-lg text-white">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 18" /></svg>
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
                            
                            {/* NEW: PanX (Yatay Kaydırma) */}
                            <SliderControl 
                                id="panX" 
                                label="Offset X" 
                                value={settings.panX} 
                                min={-100} 
                                max={100} 
                                step={1} 
                                unit="px" 
                                onChange={handleSliderChange} 
                            />
                            
                            {/* NEW: PanY (Dikey Kaydırma) */}
                            <SliderControl 
                                id="panY" 
                                label="Offset Y" 
                                value={settings.panY} 
                                min={-100} 
                                max={100} 
                                step={1} 
                                unit="px" 
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
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0L8 12m4 4V4" /></svg>
                        )}
                        Download Image (PNG)
                    </button>
                </div>
            </div>

            {/* --- PHOTO PREVIEW / RIGHT AREA --- */}
            {/* Mobil görünümde yukarıda kalmalı (order-1) ve esnek olmalı */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden flex items-center justify-center p-4 md:p-8 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:20px_20px] order-1 md:order-none">
                
                {/* Preview Container (Relative) */}
                <div
                    className={`relative transition-all duration-300 ease-out flex items-center justify-center overflow-hidden w-full h-full max-w-[900px] max-h-[80vh] ${getShadowClass(settings.shadow)}`}
                    style={{
                         borderRadius: `${settings.borderRadius}px`,
                         padding: `${settings.padding}px`, 
                         ...getBackgroundStyle(), 
                         overflow: 'hidden', 
                         aspectRatio: settings.aspectRatio, // Applied aspect ratio
                    }}
                >
                    {/* Inner Container (Image/Canvas Wrapper) */}
                    <div
                        className="relative transition-all duration-300 w-full h-full" 
                        style={{
                            overflow: 'hidden',
                            borderRadius: `${settings.borderRadius}px`, 
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
                                    borderRadius: `0 0 ${settings.borderRadius}px ${settings.borderRadius}px`,
                                }}
                            >
                                <p className="text-white text-xs font-semibold px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-sm shadow-lg border border-white/10">
                                    {settings.watermarkText}
                                </p>
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