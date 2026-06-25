  // --- THE RELOAD ALIGNMENT FIX ---
  // Forces the viewport back to the absolute top on reload to prevent container misalignment
  if (history.scrollRestoration) {
    history.scrollRestoration = 'manual';
  }

  window.addEventListener('beforeunload', () => {
    window.scrollTo(0, 0);
  });



// ==========================================================================
  // 1. SYSTEM DATABASE CONFIG CORES
  // ==========================================================================
  const TMDB_API_KEY = '17dda878af450c0446d6bed9bb78c91e'; 
  const IMG_PATH_PREFIX = 'https://image.tmdb.org/t/p/w500';
  const ORIGINAL_IMG_PREFIX = 'https://image.tmdb.org/t/p/original'; 

  // MULTI-PROVIDER STREAMING ENDPOINTS (Massive Coverage for K-Dramas, Anime & Asian Cinema)
  const STREAM_PROVIDERS = {
      vidsrc_to: {
          name: "VidSrc.to (Default)",
          movie: (id) => `https://vidsrc.to/embed/movie/${id}`,
          tv: (id, s, e) => `https://vidsrc.to/embed/tv/${id}/${s}/${e}`
      },
      embed_su: {
          name: "Embed.su (Fast Updates)",
          movie: (id) => `https://embed.su/embed/movie/${id}`,
          tv: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`
      },
      smashystream: {
          name: "SmashyStream (Niche Backups)",
          movie: (id) => `https://embed.smashystream.com/playere.php?tmdb=${id}`,
          tv: (id, s, e) => `https://embed.smashystream.com/playere.php?tmdb=${id}&season=${s}&episode=${e}`
      },
      vidsrc_cc: {
          name: "VidSrc.cc (International Cluster)",
          movie: (id) => `https://vidsrc.cc/vidsrc/movie/${id}`,
          tv: (id, s, e) => `https://vidsrc.cc/vidsrc/tv/${id}/${s}/${e}`
      },
      vidsrc_me: {
          name: "VidSrc.me (Legacy Stable)",
          movie: (id) => `https://vidsrc.me/embed/movie/${id}`,
          tv: (id, s, e) => `https://vidsrc.me/embed/tv/${id}/${s}/${e}`
      },
      two_embed: {
          name: "2Embed (Failover Route)",
          movie: (id) => `https://www.2embed.cc/embed/${id}`,
          tv: (id, s, e) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`
      }
  };

  let activeMediaId = null;
  let activeMediaType = 'movie'; 
  let currentSeason = 1;
  let currentEpisode = 1;
  let currentProvider = 'vidsrc_to'; // Key matching a provider from STREAM_PROVIDERS

  let currentCategoryFilter = 'all'; 
  let currentSeriesData = null;

  let heroSlidesData = [];
  let currentHeroIndex = 0;
  let heroRotationClock = null;

  // GLOBAL SCALER FOR CAST TOGGLE ENGINE
  let activeCastDataset = [];
  let castExpandedMode = false;

  // Global Watchlist Array
  let myWatchlist = JSON.parse(localStorage.getItem('bumblebee_watchlist')) || [];
  
  // ==========================================================================
  // 2. EXPANDED SYSTEM DATA LOAD MANAGERS
  // ==========================================================================
  async function fetchWorkspaceData() {
    const homeShelves = document.getElementById('homeShelvesContainer');
    const singleSection = document.getElementById('singleGridSection');
    const carousel = document.getElementById('heroCarouselContainer');

    try {
      if (currentCategoryFilter === 'all') {
        if (homeShelves) homeShelves.classList.remove('hidden');
        if (singleSection) singleSection.classList.add('hidden');
        
        if (carousel) {
          carousel.style.display = 'block';
          carousel.classList.remove('trigger-refresh');
          void carousel.offsetWidth; 
        }

        fetchHeroCarouselData();
        await buildOrganizedHomeFeed();
      } else if (currentCategoryFilter === 'mylist') {
        clearInterval(heroRotationClock);
        if (carousel) carousel.style.display = 'none';
        if (homeShelves) homeShelves.classList.add('hidden');
        if (singleSection) singleSection.classList.remove('hidden');
        
        const savedList = JSON.parse(localStorage.getItem('bumblebee_watchlist')) || [];
        populateBentoGrid(savedList);
      } else {
        clearInterval(heroRotationClock);
        if (carousel) carousel.style.display = 'none';
        if (homeShelves) homeShelves.classList.add('hidden');
        if (singleSection) singleSection.classList.remove('hidden');

        let pageRequests = [];
        for (let p = 1; p <= 3; p++) {
          let requestUrl = '';
          if (currentCategoryFilter === 'movie') {
            requestUrl = `https://api.themoviedb.org/3/discover/movie?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&page=${p}`;
          } else if (currentCategoryFilter === 'tv') {
            requestUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&sort_by=popularity.desc&page=${p}`;
          } else if (currentCategoryFilter === 'asian-drama') {
            requestUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_original_language=ko&without_genres=16&sort_by=popularity.desc&page=${p}`;
          } else if (currentCategoryFilter === 'anime') {
            requestUrl = `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=${p}`;
          }
          if (requestUrl) pageRequests.push(fetch(requestUrl).then(res => res.json()));
        }

        const resultsBlocks = await Promise.all(pageRequests);
        let aggregatedCollection = [];
        resultsBlocks.forEach(dataset => {
          if (dataset.results) aggregatedCollection = aggregatedCollection.concat(dataset.results);
        });

        populateBentoGrid(aggregatedCollection);
      }
    } catch (err) {
      console.error("WORKSPACE_DATA_FAIL:", err);
    }
  }

  async function buildOrganizedHomeFeed() {
    const container = document.getElementById('homeShelvesContainer');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-secondary); padding:20px;">Synchronizing home feed matrix arrays...</div>';

    const endpoints = {
      movies: `https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}`,
      shows: `https://api.themoviedb.org/3/trending/tv/week?api_key=${TMDB_API_KEY}`,
      dramas: `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_original_language=ko&without_genres=16&sort_by=popularity.desc`,
      animes: `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc`
    };

    try {
      const [moviesRes, showsRes, dramasRes, animesRes] = await Promise.all([
        fetch(endpoints.movies).then(r => r.json()),
        fetch(endpoints.shows).then(r => r.json()),
        fetch(endpoints.dramas).then(r => r.json()),
        fetch(endpoints.animes).then(r => r.json())
      ]);

      container.innerHTML = ''; 

      appendShelfRow("Trending Movies", moviesRes.results, 'movie');
      appendShelfRow("Trending Shows", showsRes.results, 'tv');
      appendShelfRow("Trending Asian Dramas", dramasRes.results, 'tv');
      appendShelfRow("Trending Anime", animesRes.results, 'tv');

    } catch (error) {
      container.innerHTML = '<div style="color:#ff4a4a; padding:20px;">Failed to compile categorized rows.</div>';
      console.error("HOME_FEED_COMPILE_FAIL:", error);
    }
  }

  function appendShelfRow(title, dataset, fallbackType) {
    const container = document.getElementById('homeShelvesContainer');
    if (!dataset || dataset.length === 0 || !container) return;

    const rowWrapper = document.createElement('section');
    rowWrapper.className = 'content-shelf-row';

    const heading = document.createElement('h3');
    heading.className = 'shelf-title-node';
    heading.textContent = title;
    rowWrapper.appendChild(heading);

    const track = document.createElement('div');
    track.className = 'shelf-scroll-track';

    dataset.forEach((item, index) => {
      if (!item.poster_path) return;
      const labelTitle = item.title || item.name || 'Active Title';
      const rawDate = item.release_date || item.first_air_date || '----';
      const splitYear = rawDate.split('-')[0];
      let structuralType = item.media_type || fallbackType;
      
      const ratingScore = item.vote_average ? item.vote_average.toFixed(1) : 'NR';

      const card = document.createElement('div');
      card.className = 'media-card';
      card.style.animationDelay = `${index * 0.02}s`;
      card.innerHTML = `
        <div class="img-containment-node">
          <img src="${IMG_PATH_PREFIX}${item.poster_path}" alt="${labelTitle}" loading="lazy">
        </div>
        <div class="meta-text-node">
          <h4>${labelTitle}</h4>
          <div class="sub-meta-flex">
            <span>${splitYear}</span>
            <div class="card-rating-badge">
              <i class="ph-fill ph-star"></i>
              <span>${ratingScore}</span>
            </div>
          </div>
        </div>
      `;

      card.addEventListener('click', () => openCinemaView(item, structuralType));
      track.appendChild(card);
    });

    rowWrapper.appendChild(track);
    container.appendChild(rowWrapper);
  }

  function populateBentoGrid(collection) {
    const singleSection = document.getElementById('singleGridSection');
    let grid = null;
    
    if (singleSection && !singleSection.classList.contains('hidden')) {
      grid = singleSection.querySelector('.media-grid') || document.getElementById('trendingGrid');
    } else {
      grid = document.getElementById('trendingGrid');
    }

    if (!grid) return;
    grid.innerHTML = '';

    if (collection.length === 0) {
      if (currentCategoryFilter === 'mylist') {
        grid.innerHTML = `
          <div class="empty-watchlist-view" style="text-align: center; padding: 60px 20px; width: 100%; grid-column: 1 / -1;">
              <i class="ph-bold ph-heart-break" style="font-size: 3.5rem; color: rgba(255,255,255,0.15); display: block; margin-bottom: 16px;"></i>
              <h3 style="color: #fff; font-weight: 600; margin-bottom: 6px; font-size: 1.2rem;">Nothing in your saved.</h3>
              <p style="color: rgba(255,255,255,0.4); font-size: 0.9rem;">Your localized synchronization array is currently vacant.</p>
          </div>
        `;
      } else {
        grid.innerHTML = `<div style="color:var(--text-secondary); font-size:0.9rem; padding:20px;">No media elements match active layout filters.</div>`;
      }
      return;
    }

    collection.forEach((item, index) => {
      if (!item.poster_path) return;
      const labelTitle = item.title || item.name || 'Active Element';
      const rawDate = item.release_date || item.first_air_date || '----';
      const splitYear = rawDate.split('-')[0];
      
      let structuralType = item.media_type || (currentCategoryFilter === 'all' ? (item.title ? 'movie' : 'tv') : currentCategoryFilter);
      if (currentCategoryFilter === 'asian-drama' || currentCategoryFilter === 'anime' || currentCategoryFilter === 'mylist') {
          structuralType = item.media_type || (item.title ? 'movie' : 'tv');
      }
      
      const ratingScore = item.vote_average ? Number(item.vote_average).toFixed(1) : 'NR';

      const bentoCard = document.createElement('div');
      bentoCard.className = 'media-card';
      bentoCard.style.animationDelay = `${index * 0.015}s`;
      
      bentoCard.innerHTML = `
        <div class="img-containment-node">
          <img src="${IMG_PATH_PREFIX}${item.poster_path}" alt="${labelTitle}" loading="lazy">
        </div>
        <div class="meta-text-node">
          <h4>${labelTitle}</h4>
          <div class="sub-meta-flex">
            <span>${splitYear}</span>
            <div class="card-rating-badge">
              <i class="ph-fill ph-star"></i>
              <span>${ratingScore}</span>
            </div>
          </div>
        </div>
      `;

      bentoCard.addEventListener('click', () => openCinemaView(item, structuralType));
      grid.appendChild(bentoCard);
    });
  }

  // ==========================================================================
  // 3. CINEMATIC HERO CAROUSEL ENGINE LOGIC
  // ==========================================================================
  async function fetchHeroCarouselData() {
    try {
      const response = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}`);
      const data = await response.json();
      
      heroSlidesData = (data.results || []).filter(item => item.backdrop_path).slice(0, 5);
      
      if (heroSlidesData.length > 0) {
        renderHeroSlides();
        startHeroRotationLoop();
      }
    } catch (error) {
      console.error("HERO_CAROUSEL_DATA_FAIL:", error);
    }
  }

  function renderHeroSlides() {
    const track = document.getElementById('heroTrack');
    const indicatorsContainer = document.getElementById('heroIndicators');
    if (!track || !indicatorsContainer) return;

    track.innerHTML = '';
    indicatorsContainer.innerHTML = '';

    const savedList = JSON.parse(localStorage.getItem('bumblebee_watchlist')) || [];

    heroSlidesData.forEach((item, idx) => {
      const slideTitle = item.title || item.name || 'Featured Title';
      const slideOverview = item.overview || 'No dynamic synopsis logs synchronized in database core indices.';
      const slideType = item.media_type || (item.title ? 'movie' : 'tv');
      
      const isSaved = savedList.some(savedItem => savedItem.id === item.id);
      const watchListIcon = isSaved ? 'ph-fill ph-check-circle' : 'ph-bold ph-plus';
      const watchListText = isSaved ? 'In My List' : 'My List';
      const activeClass = isSaved ? 'added' : '';

      const slide = document.createElement('div');
      slide.className = `hero-slide ${idx === 0 ? 'active' : ''}`;
      slide.innerHTML = `
        <img src="${ORIGINAL_IMG_PREFIX}${item.backdrop_path}" class="hero-backdrop-img" alt="${slideTitle}">
        <div class="hero-cinematic-overlay"></div>
        <div class="hero-content-cluster">
          <div class="hero-badge-row">
            <span class="hero-trending-badge">Trending #${idx + 1}</span>
            <span class="hero-type-badge">${slideType.toUpperCase()}</span>
          </div>
          <h2 class="hero-title-node">${slideTitle}</h2>
          <p class="hero-logline-summary">${slideOverview}</p>
          <div class="hero-action-buttons">
            <button class="hero-btn-primary" onclick="launchHeroCinema(${idx})">
              <i class="ph-fill ph-play"></i> PLAY
            </button>
            <button class="hero-btn-secondary hero-watchlist-btn ${activeClass}" onclick="toggleHeroWatchlist(${idx}, this)">
              <i class="${watchListIcon}"></i> <span>${watchListText}</span>
            </button>
          </div>
        </div>
      `;
      track.appendChild(slide);

      const pill = document.createElement('div');
      pill.className = `indicator-pill ${idx === 0 ? 'active' : ''}`;
      pill.innerHTML = `<div class="indicator-fill-progress"></div>`;
      pill.onclick = () => jumpToHeroSlide(idx);
      indicatorsContainer.appendChild(pill);
    });

    currentHeroIndex = 0;
  }

  function toggleHeroWatchlist(index, buttonElement) {
    const item = heroSlidesData[index];
    if (!item) return;

    let savedList = JSON.parse(localStorage.getItem('bumblebee_watchlist')) || [];
    const existingIndex = savedList.findIndex(savedItem => savedItem.id === item.id);
    
    const iconNode = buttonElement.querySelector('i');
    const textNode = buttonElement.querySelector('span');

    if (existingIndex > -1) {
      savedList.splice(existingIndex, 1);
      buttonElement.classList.remove('added');
      if (iconNode) iconNode.className = 'ph-bold ph-plus';
      if (textNode) textNode.textContent = 'My List';
      showPremiumToast(`${item.title || item.name} removed from your registry matrix`, "ph-trash");
    } else {
      let structuralType = item.media_type || (item.title ? 'movie' : 'tv');
      const safeItem = {
        id: item.id,
        title: item.title,
        name: item.name,
        poster_path: item.poster_path,
        release_date: item.release_date,
        first_air_date: item.first_air_date,
        media_type: structuralType,
        vote_average: item.vote_average,
        overview: item.overview
      };
      
      savedList.push(safeItem);
      buttonElement.classList.add('added');
      if (iconNode) iconNode.className = 'ph-fill ph-check-circle';
      if (textNode) textNode.textContent = 'In My List';
      showPremiumToast(`${item.title || item.name} synchronized to My List!`, "ph-check-circle");
    }

    myWatchlist = savedList;
    localStorage.setItem('bumblebee_watchlist', JSON.stringify(savedList));
  }

  function startHeroRotationLoop() {
    clearInterval(heroRotationClock);
    heroRotationClock = setInterval(() => {
      moveHeroSlide(1);
    }, 7000); 
  }

  function moveHeroSlide(direction) {
    const slides = document.querySelectorAll('.hero-slide');
    const pills = document.querySelectorAll('.indicator-pill');
    if (slides.length === 0) return;

    slides[currentHeroIndex].classList.remove('active');
    pills[currentHeroIndex].classList.remove('active');

    currentHeroIndex = (currentHeroIndex + direction + slides.length) % slides.length;

    slides[currentHeroIndex].classList.add('active');
    pills[currentHeroIndex].classList.add('active');
  }

  function jumpToHeroSlide(targetIndex) {
    const slides = document.querySelectorAll('.hero-slide');
    const pills = document.querySelectorAll('.indicator-pill');
    if (slides.length === 0) return;

    slides[currentHeroIndex].classList.remove('active');
    pills[currentHeroIndex].classList.remove('active');

    currentHeroIndex = targetIndex;

    slides[currentHeroIndex].classList.add('active');
    pills[currentHeroIndex].classList.add('active');
    
    startHeroRotationLoop();
  }

  function launchHeroCinema(index) {
    const selectedItem = heroSlidesData[index];
    if (!selectedItem) return;

    let targetType = selectedItem.media_type || (selectedItem.title ? 'movie' : 'tv');
    openCinemaView(selectedItem, targetType);
  }

  function switchCategory(category, element) {
    try {
      if (typeof closeCinemaView === 'function') {
        closeCinemaView();
      }

      currentCategoryFilter = category;

      const inputField = document.getElementById('genreSearchInput');
      if (inputField) inputField.value = '';

      if (element) {
        document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));
        element.classList.add('active');
      }

      updateGenreSearchVisibility();
      fetchWorkspaceData();

    } catch (error) {
      console.error("Navigation error bypassed safely:", error);
    }
  }

  // ==========================================================================
  // 5. REGIONAL & SPECIALIZED CONTENT PIPELINES
  // ==========================================================================
  async function loadDramaContent(countryCode, elementClicked) {
    if (typeof closeCinemaView === 'function') closeCinemaView();
    
    document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));
    if (elementClicked) elementClicked.classList.add('active');

    clearInterval(heroRotationClock);
    const carousel = document.getElementById('heroCarouselContainer');
    if (carousel) carousel.style.display = 'none';

    currentCategoryFilter = 'asian-drama'; 
    
    const inputField = document.getElementById('genreSearchInput');
    if (inputField) inputField.value = '';
    
    if (typeof autoCloseMobileMenu === 'function') autoCloseMobileMenu();
    if (typeof updateGenreSearchVisibility === 'function') updateGenreSearchVisibility();
    fetchWorkspaceData();
  }

  async function loadAnimeContent(elementClicked) {
    if (typeof closeCinemaView === 'function') closeCinemaView();
    
    document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));
    if (elementClicked) elementClicked.classList.add('active');

    clearInterval(heroRotationClock);
    const carousel = document.getElementById('heroCarouselContainer');
    if (carousel) carousel.style.display = 'none';

    currentCategoryFilter = 'anime';
    
    const inputField = document.getElementById('genreSearchInput');
    if (inputField) inputField.value = '';
    
    if (typeof autoCloseMobileMenu === 'function') autoCloseMobileMenu();
    if (typeof updateGenreSearchVisibility === 'function') updateGenreSearchVisibility();
    fetchWorkspaceData();
  }

  function loadMyList(elementClicked) {
    if (typeof closeCinemaView === 'function') closeCinemaView();
    
    if (elementClicked) {
      document.querySelectorAll('.menu-link').forEach(link => link.classList.remove('active'));
      elementClicked.classList.add('active');
    }
    
    clearInterval(heroRotationClock);
    const carousel = document.getElementById('heroCarouselContainer');
    if (carousel) carousel.style.display = 'none';

    const homeShelves = document.getElementById('homeShelvesContainer');
    const singleSection = document.getElementById('singleGridSection');
    
    if (homeShelves) homeShelves.classList.add('hidden');
    if (singleSection) singleSection.classList.remove('hidden');

    currentCategoryFilter = 'mylist';

    if (typeof autoCloseMobileMenu === 'function') autoCloseMobileMenu();
    if (typeof updateGenreSearchVisibility === 'function') updateGenreSearchVisibility();

    const savedList = JSON.parse(localStorage.getItem('bumblebee_watchlist')) || [];
    populateBentoGrid(savedList);
  }

  // ==========================================================================
  // 6. EXPANDED SEARCH OVERLAY SYSTEMS ENGINE
  // ==========================================================================



  const globalSearchInput = document.getElementById('globalSearch');
  const overlaySearchInput = document.getElementById('overlaySearchInput');
  const searchOverlay = document.getElementById('searchOverlay');
  const overlayResultsGrid = document.getElementById('overlayResultsGrid');
  const resultsHeading = document.getElementById('resultsHeading');

  let overlayDebounceClock = null;

  function openSearchOverlay() {
    if (!searchOverlay) return;
    searchOverlay.classList.add('active');
    document.body.style.overflow = 'hidden'; 
    if (overlaySearchInput) overlaySearchInput.focus();
    
    if (overlaySearchInput && overlaySearchInput.value.trim().length < 2) {
      loadSearchTrendingRecommendations();
    }
  }

  function closeSearchOverlay() {
    if (!searchOverlay) return;
    searchOverlay.classList.remove('active');
    document.body.style.overflow = ''; 
    if (globalSearchInput) globalSearchInput.value = '';
    if (overlaySearchInput) overlaySearchInput.value = '';
  }

  if (globalSearchInput) {
    globalSearchInput.addEventListener('focus', openSearchOverlay);
  }

  async function loadSearchTrendingRecommendations() {
    if (resultsHeading) resultsHeading.textContent = "Trending Now";
    try {
      const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}`);
      const dataset = await res.json();
      populateCustomGrid(dataset.results || [], overlayResultsGrid);
    } catch (err) {
      console.error("OVERLAY_TRENDING_FAIL:", err);
    }
  }

  if (overlaySearchInput) {
    overlaySearchInput.addEventListener('input', (e) => {
      clearTimeout(overlayDebounceClock);
      const purifiedQuery = e.target.value.trim();

      // === INTERCEPTOR REDIRECT LINK IS PLACED HERE ===
      const intercepted = checkSearchForAnniversary(purifiedQuery, "overlayResultsGrid");
      if (intercepted) return; // Completely stops TMDB search if anniversary matches
      // ===============================================

      if (purifiedQuery.length < 2) {
        loadSearchTrendingRecommendations();
        return;
      }

      overlayDebounceClock = setTimeout(async () => {
        if (resultsHeading) resultsHeading.textContent = `Search Results for "${purifiedQuery}"`;
        try {
          const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(purifiedQuery)}`);
          const dataset = await res.json();
          populateCustomGrid(dataset.results || [], overlayResultsGrid);
        } catch (err) { 
          console.error("OVERLAY_QUERY_FAIL:", err); 
        }
      }, 350);
    });
  }

  function populateCustomGrid(collection, gridTarget) {
    if (!gridTarget) return;
    gridTarget.innerHTML = '';
    
    if (collection.length === 0) {
      gridTarget.innerHTML = `<div style="color:var(--text-secondary); font-size:1rem; padding:20px;">No media matches found. Try another token query.</div>`;
      return;
    }

    collection.forEach((item, index) => {
      if (!item.poster_path) return;
      const labelTitle = item.title || item.name || 'Active Element';
      const rawDate = item.release_date || item.first_air_date || '----';
      const splitYear = rawDate.split('-')[0];
      let structuralType = item.media_type || (item.title ? 'movie' : 'tv');

      const bentoCard = document.createElement('div');
      bentoCard.className = 'media-card';
      bentoCard.style.animationDelay = `${index * 0.02}s`;
      
      bentoCard.innerHTML = `
        <div class="img-containment-node">
          <img src="${IMG_PATH_PREFIX}${item.poster_path}" alt="${labelTitle}" loading="lazy">
        </div>
        <div class="meta-text-node">
          <h4>${labelTitle}</h4>
          <div class="sub-meta-flex">
            <span>${splitYear}</span>
            <span>${structuralType.toUpperCase()}</span>
          </div>
        </div>
      `;

      bentoCard.addEventListener('click', () => {
        closeSearchOverlay();
        openCinemaView(item, structuralType);
      });
      gridTarget.appendChild(bentoCard);
    });
  }

  // ==========================================================================
  // 7. CINEMATIC TERMINAL STREAM CONNECTOR (INLINE VIEW SWITCH)
  // ==========================================================================
  async function openCinemaView(movieData, forcedType) {
    activeMediaId = movieData.id; 
    activeMediaType = forcedType || movieData.media_type || (movieData.title ? 'movie' : 'tv'); 
    currentSeason = 1; 
    currentEpisode = 1;
    castExpandedMode = false;

    // Swap Main Structural Layout Panels Safely
    const primaryGridPanel = document.querySelector('.workspace-main-panel:not(.player-view-panel)');
    if (primaryGridPanel) primaryGridPanel.style.display = 'none';
    
    const playerPanel = document.getElementById('cinemaPlayerPanel');
    if (playerPanel) playerPanel.style.display = 'block';

    const parsedTitle = movieData.title || movieData.name || 'Active Element Name';
    const parsedPlot = movieData.overview || movieData.plot || "No dynamic synopsis logs synchronized in layout elements.";
    const parsedPoster = movieData.poster_path ? `${IMG_PATH_PREFIX}${movieData.poster_path}` : (movieData.poster || 'placeholder.jpg');
    const ratingValue = movieData.vote_average ? Number(movieData.vote_average).toFixed(1) : (movieData.rating || 'N/A');
    const rawDate = movieData.release_date || movieData.first_air_date || '----';
    const splitYear = rawDate.split('-')[0];

    // ==========================================
    // 🎬 INJECTED: HISTORY SAVE TRIGGER
    // ==========================================
    console.log("🎬 SAVING TO HISTORY:", parsedTitle, activeMediaId);
    if (typeof saveMediaToHistory === 'function') {
      saveMediaToHistory(activeMediaId, parsedTitle, parsedPoster, activeMediaType, ratingValue);
    }
    // ==========================================

    const cinemaMovieTitle = document.getElementById('cinemaMovieTitle');
    const sidebarMovieTitle = document.getElementById('sidebarMovieTitle');
    const cinemaPlotSummary = document.getElementById('cinemaPlotSummary');
    const cinemaPosterImg = document.getElementById('cinemaPosterImg');
    const cinemaRatingBadge = document.getElementById('cinemaRatingBadge');

    if (cinemaMovieTitle) cinemaMovieTitle.innerText = parsedTitle;
    if (sidebarMovieTitle) sidebarMovieTitle.innerText = parsedTitle;
    
    if (cinemaPlotSummary) {
      cinemaPlotSummary.innerHTML = `
        <div class="sidebar-meta-strip" style="display:flex; gap:10px; align-items:center; margin-bottom:8px; font-size:0.8rem; color:var(--text-secondary);">
          <span style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; font-weight:600; color:#fff;">${splitYear}</span>
          <span style="background:rgba(var(--accent-rgb),0.15); color:var(--accent); padding:2px 6px; border-radius:4px; font-weight:600;">${activeMediaType.toUpperCase()}</span>
          <span style="display:flex; align-items:center; gap:2px; color:#ffb800;"><i class="ph-fill ph-star"></i> ${ratingValue}</span>
        </div>
        <p style="font-size:0.88rem; line-height:1.5; color:rgba(255,255,255,0.75); margin:0; font-weight:400;">${parsedPlot}</p>
      `;
    }
    
    if (cinemaPosterImg) cinemaPosterImg.src = parsedPoster;
    if (cinemaRatingBadge) cinemaRatingBadge.innerHTML = `<i class="ph-fill ph-star"></i> ${ratingValue}`;

    // SYNC UTILITY WATCHLIST BUTTON TOGGLE INITIAL DISPLAY
    const watchlistBtn = document.querySelector("button[onclick='toggleWatchlistFromPlayer()']");
    if (watchlistBtn) {
      const icon = watchlistBtn.querySelector('i');
      const isAlreadySaved = myWatchlist.some(item => item.id === activeMediaId || (item.title === parsedTitle));
      if (isAlreadySaved) {
        watchlistBtn.classList.add('in-watchlist');
        if (icon) icon.className = 'ph-bold ph-check';
        watchlistBtn.title = "Saved in Watchlist";
      } else {
        watchlistBtn.classList.remove('in-watchlist');
        if (icon) icon.className = 'ph-bold ph-plus';
        watchlistBtn.title = "Add to Watchlist";
      }
    }

    const tvSection = document.getElementById('tvControlNode');
    const isMultiEpisode = (activeMediaType === 'tv' || activeMediaType === 'anime' || activeMediaType === 'asian-drama');

    if (isMultiEpisode) {
      if (tvSection) {
        tvSection.classList.remove('hidden');
        tvSection.innerHTML = '<div style="color:var(--text-secondary); padding:15px; font-size:0.9rem;">Loading series metadata...</div>';
      }
      await fetchSeriesStructure(activeMediaId);
    } else {
      if (tvSection) tvSection.classList.add('hidden');
    }

    executeStreamMount();
    populateServerHub(['VidSrc To', 'VidSrc Me', 'Embed Su']);
    
    if (movieData.id) {
      fetchCastDataFromAPI(activeMediaId, activeMediaType);
      fetchRecommendationsFromAPI(activeMediaId, activeMediaType);
    } else {
      activeCastDataset = movieData.cast || [];
      renderCastRosterView();
      clearRecommendationsContainer();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeCinemaView() {
    const frame = document.getElementById('videoPlayerFrame') || document.getElementById('streamFrame');
    if (frame) frame.src = "";
    
    const playerPanel = document.getElementById('cinemaPlayerPanel');
    if (playerPanel) playerPanel.style.display = 'none';

    const primaryGridPanel = document.querySelector('.workspace-main-panel:not(.player-view-panel)');
    if (primaryGridPanel) primaryGridPanel.style.display = 'block';
  }

  async function fetchSeriesStructure(seriesId) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${seriesId}?api_key=${TMDB_API_KEY}`);
      currentSeriesData = await res.json();
      
      if (currentSeriesData && currentSeriesData.seasons) {
        renderSeasonSelectors(currentSeriesData.seasons);
      }
    } catch (err) {
      console.error("SERIES_META_FETCH_FAIL:", err);
      const tvSection = document.getElementById('tvControlNode');
      if (tvSection) {
        tvSection.innerHTML = '<div style="color:#ff4a4a; padding:10px; font-size:0.85rem;">Failed to synchronize season tracking arrays.</div>';
      }
    }
  }

  function renderSeasonSelectors(seasons) {
    const tvSection = document.getElementById('tvControlNode');
    if (!tvSection) return;

    const activeSeasons = seasons.filter(s => s.season_number > 0);

    let htmlMarkup = `
      <div class="season-pill-row" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:12px; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.06);">
    `;

    activeSeasons.forEach((season, index) => {
      htmlMarkup += `
        <button class="season-pill-btn ${index === 0 ? 'active' : ''}" 
                onclick="fetchAndRenderEpisodes(${season.season_number}, this)"
                style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:0.85rem; white-space:nowrap; font-weight:500; transition:all 0.2s;">
          ${season.name || `Season ${season.season_number}`}
        </button>
      `;
    });

    htmlMarkup += `
      </div>
      <div id="episodeGridContainer" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap:10px; max-height:220px; overflow-y:auto; padding-right:4px;"></div>
    `;

    tvSection.innerHTML = htmlMarkup;

    if (activeSeasons.length > 0) {
      fetchAndRenderEpisodes(activeSeasons[0].season_number);
    }
  }

  async function fetchAndRenderEpisodes(seasonNumber, targetBtn) {
    currentSeason = seasonNumber;
    
    if (targetBtn) {
      document.querySelectorAll('.season-pill-btn').forEach(btn => btn.classList.remove('active'));
      targetBtn.classList.add('active');
    }

    const container = document.getElementById('episodeGridContainer');
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-secondary); padding:10px; font-size:0.85rem;">Syncing episodes...</div>';

    try {
      const res = await fetch(`https://api.themoviedb.org/3/tv/${activeMediaId}/season/${seasonNumber}?api_key=${TMDB_API_KEY}`);
      const data = await res.json();

      container.innerHTML = '';
      if (data.episodes && data.episodes.length > 0) {
        data.episodes.forEach(ep => {
          const epCard = document.createElement('button');
          epCard.className = `episode-select-card ${currentEpisode === ep.episode_number ? 'active' : ''}`;
          epCard.style.cssText = `
            background: rgba(255,255,255, 0.03); border: 1px solid rgba(255,255,255,0.06);
            color: rgba(255,255,255,0.7); padding: 12px; border-radius: 8px; text-align: left;
            cursor: pointer; font-size: 0.8rem; transition: all 0.2s ease; display:flex; flex-direction:column; gap:4px;
          `;
          
          epCard.innerHTML = `
            <span style="font-weight:600; color:#fff;">Ep ${ep.episode_number}</span>
            <span style="font-size:0.7rem; color:var(--text-secondary); display:block; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${ep.name || `Episode ${ep.episode_number}`}</span>
          `;

          epCard.onclick = () => {
            document.querySelectorAll('.episode-select-card').forEach(c => c.classList.remove('active'));
            epCard.classList.add('active');
            currentEpisode = ep.episode_number;
            executeStreamMount();
          };

          container.appendChild(epCard);
        });
      }
    } catch (err) {
      container.innerHTML = '<div style="color:#ff4a4a; padding:10px; font-size:0.85rem;">Failed to synchronize season tracking arrays.</div>';
      console.error("EPISODE_FETCH_FAIL:", err);
    }
  }

  function executeStreamMount() {
    const frame = document.getElementById('videoPlayerFrame') || document.getElementById('streamFrame');
    if (!frame) return;

    let targetUrl = '';
    const isMultiEpisode = (activeMediaType === 'tv' || activeMediaType === 'anime' || activeMediaType === 'asian-drama');

    if (!isMultiEpisode) {
      if (currentProvider === 'vidsrc_to') targetUrl = `https://vidsrc.to/embed/movie/${activeMediaId}`;
      else if (currentProvider === 'vidsrc_me') targetUrl = `https://vidsrc.me/embed/movie?id=${activeMediaId}`;
      else targetUrl = `https://embed.su/embed/movie/${activeMediaId}`;
    } else {
      if (currentProvider === 'vidsrc_to') targetUrl = `https://vidsrc.to/embed/tv/${activeMediaId}/${currentSeason}/${currentEpisode}`;
      else if (currentProvider === 'vidsrc_me') targetUrl = `https://vidsrc.me/embed/tv?id=${activeMediaId}&s=${currentSeason}&e=${currentEpisode}`;
      else targetUrl = `https://embed.su/embed/tv/${activeMediaId}/${currentSeason}/${currentEpisode}`;
    }
    
    frame.src = targetUrl;
  }

  function switchProvider(providerID) {
    currentProvider = providerID;
    executeStreamMount();
  }

  function populateServerHub(serverList) {
    const container = document.getElementById('serverGridContainer');
    if (!container) return;
    container.innerHTML = '';
    
    serverList.forEach((server) => {
      const providerKey = server.toLowerCase().replace(' ', '_');
      const btn = document.createElement('button');
      btn.className = `server-node-btn ${currentProvider === providerKey ? 'active-server' : ''}`;
      btn.innerHTML = `<i class="ph-fill ph-play-circle"></i> ${server}`;
      btn.onclick = () => {
        document.querySelectorAll('.server-node-btn').forEach(b => b.classList.remove('active-server'));
        btn.classList.add('active-server');
        switchProvider(providerKey);
      };
      container.appendChild(btn);
    });
  }

  async function fetchCastDataFromAPI(mediaId, type) {
    const callType = (type === 'movie') ? 'movie' : 'tv';
    try {
      const res = await fetch(`https://api.themoviedb.org/3/${callType}/${mediaId}/credits?api_key=${TMDB_API_KEY}`);
      const data = await res.json();
      
      if (data.cast) {
        activeCastDataset = data.cast.slice(0, 12).map(member => ({
          name: member.name,
          role: member.character,
          img: member.profile_path ? `${IMG_PATH_PREFIX}${member.profile_path}` : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60'
        }));
        renderCastRosterView();
      }
    } catch (err) {
      console.error("CAST_FETCH_FAIL:", err);
    }
  }

  function renderCastRosterView() {
    const container = document.getElementById('cinemaCastList');
    if (!container) return;
    container.innerHTML = '';

    const visibleItems = castExpandedMode ? activeCastDataset : activeCastDataset.slice(0, 3);

    visibleItems.forEach(actor => {
      const card = document.createElement('div');
      card.className = 'cast-member-card';
      card.innerHTML = `
        <img src="${actor.img}" class="cast-avatar-img" alt="${actor.name}">
        <div class="cast-meta-names">
          <h5>${actor.name}</h5>
          <span>${actor.role}</span>
        </div>
      `;
      container.appendChild(card);
    });

    if (activeCastDataset.length > 3) {
      const toggleBtn = document.createElement('button');
      toggleBtn.className = 'cast-toggle-action-btn';
      toggleBtn.style.cssText = `
        background: none; border: none; color: var(--accent, #00cbfe); font-size: 0.8rem;
        font-weight: 600; cursor: pointer; padding: 8px 0; width: 100%; text-align: left;
        display: flex; align-items: center; gap: 4px; transition: color 0.2s;
      `;
      toggleBtn.innerHTML = castExpandedMode 
        ? `<span>View Less</span> <i class="ph-bold ph-caret-up"></i>` 
        : `<span>View All (${activeCastDataset.length})</span> <i class="ph-bold ph-caret-down"></i>`;
      
      toggleBtn.onclick = () => {
        castExpandedMode = !castExpandedMode;
        renderCastRosterView();
      };
      container.appendChild(toggleBtn);
    }
  }

  async function fetchRecommendationsFromAPI(mediaId, type) {
    const callType = (type === 'movie') ? 'movie' : 'tv';
    const recGrid = document.getElementById('recommendedGrid') || document.querySelector('.player-view-panel #trendingGrid') || document.querySelector('#cinemaPlayerPanel .media-grid');
    
    if (!recGrid) return;
    recGrid.innerHTML = '<div style="color:var(--text-secondary); padding:10px; font-size:0.85rem;">Retrieving network recommendations...</div>';

    try {
      const res = await fetch(`https://api.themoviedb.org/3/${callType}/${mediaId}/recommendations?api_key=${TMDB_API_KEY}`);
      const data = await res.json();
      
      populateCustomGrid((data.results || []).slice(0, 6), recGrid);
    } catch (err) {
      console.error("RECOMMENDATIONS_FETCH_FAIL:", err);
      clearRecommendationsContainer();
    }
  }

  function clearRecommendationsContainer() {
    const recGrid = document.getElementById('recommendedGrid') || document.querySelector('.player-view-panel #trendingGrid');
    if (recGrid) recGrid.innerHTML = '<div style="color:var(--text-secondary); padding:10px; font-size:0.85rem;">No recommendations compiled for this matrix entity.</div>';
  }
    // ==========================================================================
    // 8. PRIVACY-FIRST SERVERLESS AUTHENTICATION (BULLETPROOF NULL-SAFE REPAIR)
    // ==========================================================================
    let currentAuthMode = 'signin'; 

    function toggleAuthModal() {
      const modal = document.getElementById('authModal');
      if (!modal) return;
      
      modal.classList.toggle('active');
      
      const msg = document.getElementById('authStatusMessage');
      if (msg) msg.classList.add('hidden');
      
      const uField = document.getElementById('authUsername');
      const pField = document.getElementById('authPassword');
      if (uField) uField.value = '';
      if (pField) pField.value = '';
      
      switchAuthTab('signin');
    }

    function switchAuthTab(mode) {
      currentAuthMode = mode;
      const tabSignIn = document.getElementById('tabSignIn');
      const tabRegister = document.getElementById('tabRegister');
      const title = document.getElementById('authTitle');
      const desc = document.getElementById('authDescription');
      const submitBtn = document.getElementById('authSubmitBtn');
      
      if (tabSignIn && tabRegister) {
        if (mode === 'signin') {
          tabSignIn.classList.add('active');
          tabRegister.classList.remove('active');
        } else {
          tabRegister.classList.add('active');
          tabSignIn.classList.remove('active');
        }
      }

      // ULTRA-SAFE: Using optional chaining (?.) so it simply skips if the element is null
      if (mode === 'signin') {
        if (title) title.textContent = "WELCOME BACK";
        if (desc) desc.textContent = "Enter your custom credentials to sync your local streaming matrix.";
        if (submitBtn) submitBtn.textContent = "Access Interface";
      } else {
      if (title) title.textContent = "CREATE PROFILE ALIAS";
      if (desc) desc.textContent = "No tracking metrics, no emails. Just a security handle for your watchlist.";
      if (submitBtn) submitBtn.textContent = "Register Account";
    }
  }

  function handleAuthEngineSubmit(e) {
    if (e) e.preventDefault();
    
    const userField = document.getElementById('authUsername')?.value?.trim();
    const passwordField = document.getElementById('authPassword')?.value?.trim();
    const statusMsg = document.getElementById('authStatusMessage');
    
    if (!userField || !passwordField) return;

    // THE FORCE INTERCEPT FOR DIPSU
if (userField.toLowerCase() === "kenanddee" && passwordField === "9112024") {
  localStorage.setItem('bumblebee_active_user', "Dipsu");
  localStorage.setItem('bumblebee_watchlist', JSON.stringify(JSON.parse(localStorage.getItem('bumblebee_watchlist')) || []));

  if (typeof syncAuthUIState === 'function') syncAuthUIState();
  toggleAuthModal();

  if (typeof renderContinueWatchingHistory === 'function') {
    renderContinueWatchingHistory();
  }

  // 🥚 EASTER EGG FLAG: Tells the browser to trigger the overlay *after* the upcoming reload
  localStorage.setItem('launch_gf_egg', 'true');

  // Force the reload to create a clean profile sandbox
  window.location.reload();

  return;
}

    let userRegistry = JSON.parse(localStorage.getItem('bumblebee_users_db')) || [];

    if (currentAuthMode === 'register') {
      const userExists = userRegistry.some(account => account.username.toLowerCase() === userField.toLowerCase());
      
      if (userExists) {
        if (statusMsg) {
          statusMsg.textContent = "Alias taken! Redirecting to Sign In...";
          statusMsg.className = "auth-status-message error";
          statusMsg.classList.remove('hidden');
        }
        setTimeout(() => switchAuthTab('signin'), 1200);
        return;
      }

      userRegistry.push({ username: userField, password: passwordField, watchlist: [] });
      localStorage.setItem('bumblebee_users_db', JSON.stringify(userRegistry));

      if (statusMsg) {
        statusMsg.textContent = "Account verified! You can now Sign In.";
        statusMsg.className = "auth-status-message success";
        statusMsg.classList.remove('hidden');
      }
      setTimeout(() => switchAuthTab('signin'), 1500);

    } else {
      const matchedUser = userRegistry.find(account => 
        account.username.toLowerCase() === userField.toLowerCase() && 
        account.password === passwordField
      );

      if (!matchedUser) {
        if (statusMsg) {
          statusMsg.textContent = "Invalid custom combination. Try again.";
          statusMsg.className = "auth-status-message error";
          statusMsg.classList.remove('hidden');
        }
        return;
      }

localStorage.setItem('bumblebee_active_user', matchedUser.username);
      localStorage.setItem('bumblebee_watchlist', JSON.stringify(matchedUser.watchlist || []));

      if (typeof syncAuthUIState === 'function') syncAuthUIState();
      toggleAuthModal();
      if (typeof fetchWorkspaceData === 'function') fetchWorkspaceData();

      // Fixed the function name typo here just in case:
      if (typeof renderContinueWatchingHistory === 'function') {
        renderContinueWatchingHistory();
      }

      // 🔥 INJECTED: Forces the page to reload instantly upon signing in,
      // creating a clean slate and loading this user's private history.
      window.location.reload();
    }
  }

  // ==========================================================================
  // 9. UNIFIED INTERFACE SESSION MANAGER
  // ==========================================================================
  function syncAuthUIState() {
    const sessionUser = localStorage.getItem('bumblebee_active_user');
    const loginTrigger = document.getElementById('loginTrigger');
    const userSessionBlock = document.getElementById('userActiveSessionBlock');
    const authLabel = document.getElementById('authenticatedUserLabel');

    if (sessionUser) {
      if (loginTrigger) loginTrigger.classList.add('hidden');
      if (userSessionBlock) userSessionBlock.classList.remove('hidden');
      if (authLabel) authLabel.textContent = sessionUser;

      const savedAvatar = localStorage.getItem(`avatar_${sessionUser}`) || 'alien';
      updateAvatarGraphicDisplay(savedAvatar);
    } else {
      if (loginTrigger) loginTrigger.classList.remove('hidden');
      if (userSessionBlock) userSessionBlock.classList.add('hidden');
    }
  }

  function toggleProfileDropdownMenu() {
    const plate = document.getElementById('profileDropdownPlate');
    const caret = document.getElementById('dropdownCaretIcon');
    if (!plate) return;

    plate.classList.toggle('show');
    if (caret) {
      caret.style.transform = plate.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
    }
  }

// MASTER FUNCTION: Handles Cute & Calm Session Sign-Out Confirmation
  function triggerSessionSignoutWorkflow() {
    const modal = document.getElementById('premiumSignoutModal');
    const confirmBtn = document.getElementById('confirmSignoutBtn');
    const cancelBtn = document.getElementById('cancelSignoutBtn');

    if (!modal) return;

    // 1. Clean out event duplication states
    const freshConfirmBtn = confirmBtn.cloneNode(true);
    const freshCancelBtn = cancelBtn.cloneNode(true);
    confirmBtn.replaceWith(freshConfirmBtn);
    cancelBtn.replaceWith(freshCancelBtn);

    // 2. Open cozy overlay layout 
    modal.classList.add('active');

    // Action A: Choose to stay on the page
    freshCancelBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });

    // Action B: Click backdrop safely to dismiss modal
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };

    // Action C: Confirm safe logout procedure 🍃
    freshConfirmBtn.addEventListener('click', () => {
      modal.classList.remove('active');
      
      // Allow completion animation frame to roll before dropping session data structure
      setTimeout(() => {
        if (typeof executeSessionLogout === 'function') {
            executeSessionLogout();
        } else {
            // Backup direct code route just in case:
            localStorage.removeItem('bumblebee_active_user');
            window.location.reload();
        }
      }, 400);
    });
  }

  function toggleDMCAModal(show) {
    const modal = document.getElementById('dmcaModal');
    if (!modal) return;
    
    if (show) {
      modal.classList.add('active');
      const plate = document.getElementById('profileDropdownPlate');
      if (plate) plate.classList.remove('show');
    } else {
      modal.classList.remove('active');
    }
  }

  function changeUserAvatar(iconName) {
    const activeUser = localStorage.getItem('bumblebee_active_user');
    if (!activeUser) return;

    localStorage.setItem(`avatar_${activeUser}`, iconName);
    updateAvatarGraphicDisplay(iconName);
  }

  function updateAvatarGraphicDisplay(iconName) {
    const targetElement = document.getElementById('headerAvatarDisplay');
    if (!targetElement) return;
    targetElement.className = `ph-bold ph-${iconName || 'alien'}`;
  }

/* ==========================================================================
   BUMBLEBEE AUTH & SESSION MODAL MANAGEMENT ENGINE
   ========================================================================== */

// MASTER FUNCTION: Handles Premium Profile Deletion Workflow
function terminateProfileAccount() {
  const activeUser = localStorage.getItem('bumblebee_active_user');
  if (!activeUser) return;

  const modal = document.getElementById('premiumDeleteModal');
  const nameLabel = document.getElementById('deleteModalTargetName');
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  const cancelBtn = document.getElementById('cancelDeleteBtn');

  if (!modal || !nameLabel) return;

  // 1. Assign target profile name to labels
  nameLabel.textContent = `"${activeUser}"`;
  
  // 2. Clear old click listeners by clean cloning to prevent leaks
  const freshConfirmBtn = confirmBtn.cloneNode(true);
  const freshCancelBtn = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(freshConfirmBtn);
  cancelBtn.replaceWith(freshCancelBtn);

  // 3. Fire animation sequence
  modal.classList.add('active');

  // UI Handle A: Clicked Cancel Button
  freshCancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // UI Handle B: Clicked backdrop overlay to cancel safely
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  // UI Handle C: Clicked premium "Terminate Profile" button 💥
  freshConfirmBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    
    // Delay processing just long enough for the exit transition to conclude seamlessly
    setTimeout(() => {
      let userRegistry = JSON.parse(localStorage.getItem('bumblebee_users_db')) || [];
      userRegistry = userRegistry.filter(account => account.username.toLowerCase() !== activeUser.toLowerCase());
      
      localStorage.setItem('bumblebee_users_db', JSON.stringify(userRegistry));
      localStorage.removeItem(`avatar_${activeUser}`);

      executeSessionLogout();
    }, 400); 
  });
}

// MASTER FUNCTION: Handles Cute & Calm Session Sign-Out Confirmation
function triggerSessionSignoutWorkflow() {
  const modal = document.getElementById('premiumSignoutModal');
  const confirmBtn = document.getElementById('confirmSignoutBtn');
  const cancelBtn = document.getElementById('cancelSignoutBtn');

  if (!modal || !confirmBtn || !cancelBtn) return;

  // 1. Clear old click listeners by clean cloning to prevent duplicates
  const freshConfirmBtn = confirmBtn.cloneNode(true);
  const freshCancelBtn = cancelBtn.cloneNode(true);
  confirmBtn.replaceWith(freshConfirmBtn);
  cancelBtn.replaceWith(freshCancelBtn);

  // 2. Open cozy overlay layout 
  modal.classList.add('active');

  // UI Handle A: Choose to stay on the couch
  freshCancelBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // UI Handle B: Click backdrop safely to dismiss modal
  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  // UI Handle C: Confirm safe logout procedure 🍃
  freshConfirmBtn.addEventListener('click', () => {
    modal.classList.remove('active');
    
    // Allow fade-out animation to finish cleanly before flushing states
    setTimeout(() => {
      executeSessionLogout();
    }, 400);
  });
}

// CORE ROUTINE: Executes the underlying logout and flushes local caching context
function executeSessionLogout() {
  localStorage.removeItem('bumblebee_active_user');
  localStorage.removeItem('bumblebee_watchlist'); 
  
  const plate = document.getElementById('profileDropdownPlate');
  if (plate) plate.classList.remove('show');

  // Check if setup routines exist before blindly executing them
  if (typeof syncAuthUIState === 'function') syncAuthUIState();
  if (typeof fetchWorkspaceData === 'function') fetchWorkspaceData();

  // Forces the page to instantly reload, resetting layout and Continue Watching grids cleanly
  window.location.reload();
}

// ==========================================================================
// 10. INITIALIZER SYSTEM CORES (OPTIMIZED, REPAIRED & MOBILE CHANNELS LINKED)
// ==========================================================================
window.addEventListener('DOMContentLoaded', () => {
  // 1. Core authentication & data pipeline boot
  if (typeof syncAuthUIState === 'function') syncAuthUIState();
  if (typeof fetchWorkspaceData === 'function') fetchWorkspaceData();

  // 2. Inject profile tools if active user is "Dipsu"
  const savedUser = localStorage.getItem('bumblebee_active_user');
  if (savedUser && typeof handleUserLoginSession === 'function') {
    handleUserLoginSession(savedUser);
  }

  // 3. Staggered stabilizer check for rendering history & easter egg panels
  setTimeout(() => {
    if (typeof renderContinueWatchingHistory === 'function') {
      renderContinueWatchingHistory();
    }

    if (localStorage.getItem('launch_gf_egg') === 'true') {
      if (typeof triggerGfEasterEggOverlay === 'function') {
        console.log("💝 Triggering girlfriend easter egg overlay post-reload!");
        triggerGfEasterEggOverlay();
      }
      localStorage.removeItem('launch_gf_egg');
    }
  }, 150);

  // 4. Dom reference maps for responsive panel structures
  const mobileMorePanel = document.getElementById('mobileMorePanel');
  const moreMenuTrigger = document.getElementById('moreMenuTrigger');
  const overlaySearchContainer = document.getElementById('searchOverlay');
  const mobileSearchTrigger = document.getElementById('mobileSearchTrigger');

  // 5. Global Unified Event Delegation Hook (Intercepts layouts, party nodes, and drops)
  window.addEventListener('click', (e) => {
    // Dropdown Profile Dimmer
    const wrapper = document.getElementById('userActiveSessionBlock');
    const plate = document.getElementById('profileDropdownPlate');
    if (wrapper && plate && !wrapper.contains(e.target)) {
      plate.classList.remove('show');
      const caret = document.getElementById('dropdownCaretIcon');
      if (caret) caret.style.transform = 'rotate(0deg)';
    }

    // Auto-Close Mobile More Drawer when clicking away
    if (mobileMorePanel && mobileMorePanel.classList.contains('show') && e.target !== moreMenuTrigger && !moreMenuTrigger?.contains(e.target)) {
      mobileMorePanel.classList.remove('show');
    }

    // 🚨 COALESCED FIX: Intercepts gallery close actions cleanly before browser captures bubble
    const closeBtn = e.target.closest('#closeGalleryBtn, .close-capsule-btn, [onclick*="closeSecretLoveCapsule"]');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      if (typeof closeSecretLoveCapsule === 'function') closeSecretLoveCapsule();
      return; // Stop processing other dropdown click logic
    }

    // Continue Watching Core Navigation Hiding Rule Interceptor
    const clickedNavItem = e.target.closest('.sidebar-menu div, .sidebar-link, .vertical-navigation-menu a, .mobile-bottom-nav .nav-item, [class*="nav"]');
    if (clickedNavItem) {
      const section = document.getElementById('continueWatchingSection');
      const tabName = clickedNavItem.textContent.trim().toLowerCase();

      if (section) {
        if (tabName.includes('tv show') || tabName.includes('movie') || tabName.includes('k-drama') || tabName.includes('anime') || tabName.includes('list')) {
          section.classList.add('hidden');
          section.style.setProperty('display', 'none', 'important');
        } else if (tabName.includes('home')) {
          setTimeout(() => {
            section.style.removeProperty('display');
            if (typeof renderContinueWatchingHistory === 'function') renderContinueWatchingHistory();
          }, 50);
        }
      }
    }

    // Watch Party Pipeline Synchronizer (Transmits stream states instantly)
    if (typeof partyDataConnection !== 'undefined' && partyDataConnection) {
      const targetSelection = e.target.closest('.server-node-btn, .server-btn, .episode-select-card, [onclick*="switchProvider"], [onclick*="launchDirectStream"]');
      if (targetSelection && typeof dispatchWatchPartyStateSync === 'function') {
        dispatchWatchPartyStateSync();
      }
    }
  });

  // 6. Mobile Interactive "More Menu Drawer" Trigger Modification
  if (moreMenuTrigger && mobileMorePanel) {
    moreMenuTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      mobileMorePanel.classList.toggle('show');
    });
    // Stop event bubbling inside panel contents to protect form clicks
    mobileMorePanel.addEventListener('click', (e) => e.stopPropagation());
  }

  // 7. Mobile Search Action Trigger Overlay Interceptor
  if (mobileSearchTrigger) {
    mobileSearchTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mobileMorePanel) mobileMorePanel.classList.remove('show');
      
      const isSearchOpen = overlaySearchContainer && overlaySearchContainer.classList.contains('active');
      if (isSearchOpen) {
        if (typeof closeSearchOverlay === 'function') closeSearchOverlay();
      } else {
        document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
        mobileSearchTrigger.classList.add('active');
        if (typeof openSearchOverlay === 'function') openSearchOverlay();
      }
    });
  }

  // 8. Mobile Navigation Array Action Routing Processors
  document.querySelectorAll('.mobile-bottom-nav .nav-item[data-nav], .panel-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-nav') || btn.getAttribute('data-target');
      if (!target) return;

      if (typeof closeSearchOverlay === 'function') closeSearchOverlay();
      if (mobileMorePanel) mobileMorePanel.classList.remove('show');

      document.querySelectorAll('.mobile-bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
      const parentNavItem = btn.classList.contains('nav-item') ? btn : document.querySelector(`.mobile-bottom-nav .nav-item[data-nav="${target}"]`);
      if (parentNavItem) parentNavItem.classList.add('active');

      // Pipeline routing conditions matching application modes
      if (target === 'all') { if (typeof switchCategory === 'function') switchCategory('all'); }
      else if (target === 'movie') { if (typeof switchCategory === 'function') switchCategory('movie'); }
      else if (target === 'tv') { if (typeof switchCategory === 'function') switchCategory('tv'); }
      else if (target === 'anime') { if (typeof loadAnimeContent === 'function') loadAnimeContent(); }
      else if (target === 'kdrama') { if (typeof loadDramaContent === 'function') loadDramaContent('KR'); }
      else if (target === 'mylist') { if (typeof loadMyList === 'function') loadMyList(); }
    });
  });

  // 9. Mobile Safety Policy Compliance Panel Modal (DMCA)
  const mobileDmcaBtn = document.getElementById('mobileDmcaBtn');
  if (mobileDmcaBtn) {
    mobileDmcaBtn.addEventListener('click', () => {
      if (mobileMorePanel) mobileMorePanel.classList.remove('show');
      if (typeof toggleDMCAModal === 'function') toggleDMCAModal(true);
    });
  }

  // 10. Scroll Window Back-to-Top Button Visibility Monitor
  window.addEventListener('scroll', () => {
    const scrollTopButton = document.getElementById('globalScrollTopBtn');
    if (!scrollTopButton) return;
    window.scrollY > 300 ? scrollTopButton.classList.add('visible') : scrollTopButton.classList.remove('visible');
  });

  // 11. Immersive UI Splash Screen Preloader Discharging Core
  setTimeout(() => {
    const appLoader = document.getElementById('appLoader');
    if (appLoader) appLoader.classList.add('fade-out');
    document.body.classList.add('page-loaded');
  }, 1000); 
});

  // ==========================================================================
  // CONTEXTUAL GENRE SEARCH CONTROLLER (RACE-CONDITION FIXED)
  // ==========================================================================
  const genreSearchInput = document.getElementById('genreSearchInput');
  const genreSearchContainer = document.getElementById('genreSearchContainer');
  let genreSearchDebounce = null;
  let genreSearchAbortController = null; 

  function updateGenreSearchVisibility() {
    if (!genreSearchContainer) return;
    
    if (currentCategoryFilter === 'all' || currentCategoryFilter === 'mylist') {
      genreSearchContainer.classList.add('hidden');
    } else {
      genreSearchContainer.classList.remove('hidden');
      const inputField = document.getElementById('genreSearchInput');
      if (inputField) {
        if (currentCategoryFilter === 'movie') inputField.placeholder = "Search Movies...";
        else if (currentCategoryFilter === 'tv') inputField.placeholder = "Search TV Shows...";
        else if (currentCategoryFilter === 'anime') inputField.placeholder = "Search Anime...";
        else if (currentCategoryFilter === 'asian-drama') inputField.placeholder = "Search K-Dramas...";
      }
    }
  }

  if (genreSearchInput) {
    genreSearchInput.addEventListener('input', (e) => {
      clearTimeout(genreSearchDebounce);
      
      if (genreSearchAbortController) {
        genreSearchAbortController.abort();
      }

      const query = e.target.value.trim();
      const lockedCategoryContext = currentCategoryFilter; 

      if (query.length < 2) {
        fetchWorkspaceData(); 
        return;
      }

      genreSearchDebounce = setTimeout(async () => {
        let searchUrl = '';
        if (lockedCategoryContext === 'movie') {
          searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        } else if (lockedCategoryContext === 'tv') {
          searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}`;
        } else if (lockedCategoryContext === 'asian-drama') {
          searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&with_original_language=ko`;
        } else if (lockedCategoryContext === 'anime') {
          searchUrl = `https://api.themoviedb.org/3/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&with_genres=16&with_original_language=ja`;
        }

        if (!searchUrl) return;

        genreSearchAbortController = new AbortController();

        try {
          const response = await fetch(searchUrl, { signal: genreSearchAbortController.signal });
          const data = await response.json();
          
          if (currentCategoryFilter !== lockedCategoryContext) return;

          const singleSection = document.getElementById('singleGridSection');
          let targetGrid = document.getElementById('trendingGrid');
          
          if (singleSection && !singleSection.classList.contains('hidden')) {
            targetGrid = singleSection.querySelector('.media-grid') || targetGrid;
          }
          
          let filteredResults = data.results || [];
          if (lockedCategoryContext === 'asian-drama') {
            filteredResults = filteredResults.filter(item => item.original_language === 'ko');
          }
          
          populateCustomGrid(filteredResults, targetGrid);
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error("GENRE_SEARCH_ERROR:", err);
          }
        }
      }, 300); 
    });
  }

  // ==========================================================================
  // 11. PREMIUM NOTIFICATION TOAST ENGINE
  // ==========================================================================
  function showPremiumToast(message, iconClass = "ph-rocket-launch") {
      const oldToast = document.querySelector('.bumblebee-toast');
      if (oldToast) oldToast.remove();

      const toast = document.createElement('div');
      toast.className = 'bumblebee-toast';
      toast.innerHTML = `<i class="ph-bold ${iconClass}"></i> <span>${message}</span>`;
      document.body.appendChild(toast);

      setTimeout(() => toast.classList.add('show'), 50);

      setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => toast.remove(), 400);
      }, 3000);
  }

  // ==========================================================================
  // 12. WATCHLIST CORE UTILITIES (UNIFIED ARCHITECTURE)
  // ==========================================================================
  function toggleWatchlistFromPlayer() {
      const movieTitle = document.getElementById('cinemaMovieTitle').innerText;
      const moviePoster = document.getElementById('cinemaPosterImg').src;
      
      const watchlistBtn = document.querySelector("button[onclick='toggleWatchlistFromPlayer()']");
      const icon = watchlistBtn ? watchlistBtn.querySelector('i') : null;

      const existingIndex = myWatchlist.findIndex(item => item.title === movieTitle);

      if (existingIndex > -1) {
          myWatchlist.splice(existingIndex, 1);
          
          if (watchlistBtn && icon) {
              watchlistBtn.classList.remove('in-watchlist');
              icon.className = 'ph-bold ph-plus';
              watchlistBtn.title = "Add to Watchlist";
          }
          
          showPremiumToast(`${movieTitle} cleared from your registry matrix`, "ph-trash");
      } else {
          const targetPosterPath = moviePoster.replace(IMG_PATH_PREFIX, '').replace(ORIGINAL_IMG_PREFIX, '');
          const currentRating = document.getElementById('cinemaRatingBadge') ? document.getElementById('cinemaRatingBadge').innerText.replace(/[^\d.]/g, '') : '0';

          myWatchlist.push({
              id: activeMediaId,
              title: movieTitle,
              name: movieTitle,
              poster_path: targetPosterPath,
              media_type: activeMediaType,
              vote_average: parseFloat(currentRating) || 0,
              release_date: '',
              savedAt: new Date().toISOString()
          });
          
          if (watchlistBtn && icon) {
              watchlistBtn.classList.add('in-watchlist');
              icon.className = 'ph-bold ph-check'; 
              watchlistBtn.title = "Saved in Watchlist";
          }
          
          showPremiumToast(`${movieTitle} synchronized to My List!`, "ph-check-circle");
      }

      localStorage.setItem('bumblebee_watchlist', JSON.stringify(myWatchlist));
  }

  // ==========================================================================
  // 13. UTILITY ACTIONS (SHARE / DOWNLOAD PIPELINES)
  // ==========================================================================
  function shareCurrentMedia() {
      const movieTitle = document.getElementById('cinemaMovieTitle').innerText;
      
      if (navigator.share) {
          navigator.share({
              title: `Streaming ${movieTitle}`,
              text: `Check out ${movieTitle} on BUMBLEBEE // STUDIO`,
              url: window.location.href
          })
          .then(() => showPremiumToast("Media node link shared successfully!", "ph-share-network"))
          .catch(err => console.log(err));
      } else {
          navigator.clipboard.writeText(window.location.href)
              .then(() => showPremiumToast("Link copied to clipboard storage arrays!", "ph-clipboard"))
              .catch(() => showPremiumToast("Failed to write to system clipboard", "ph-x-circle"));
      }
  }

  function downloadStreamTrigger() {
      const activeFrame = document.getElementById('videoPlayerFrame');
      
      if (activeFrame && activeFrame.src) {
          showPremiumToast("Routing direct file pipeline allocation...", "ph-download-simple");
          setTimeout(() => {
              window.open(activeFrame.src, '_blank');
          }, 800);
      } else {
          showPremiumToast("No active streaming server frame loaded.", "ph-warning");
      }
  }

// ==========================================================================
// 14. GF EASTER EGG LAYOUT ENGINE (PREMIUM ROMANCE UI WITH GIF LOOP & MOBILE FIX)
// ==========================================================================
function triggerGfEasterEggOverlay() {
  console.log("Initializing Dipsu's premium layout overlay...");

  // 1. Create the immersive, deep-gradient cinematic overlay
  const overlay = document.createElement('div');
  overlay.id = "gfEasterEggOverlay";
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: radial-gradient(circle at center, #1f0a15 0%, #050103 100%);
    z-index: 999999; display: flex; flex-direction: column;
    align-items: center; justify-content: center; opacity: 0;
    transition: opacity 1s cubic-bezier(0.25, 1, 0.5, 1);
    font-family: system-ui, -apple-system, sans-serif; overflow: hidden;
  `;
  
  // 2. Custom Glassmorphism card layout with embedded GIF loop
  overlay.innerHTML = `
    <div id="eggContent" style="position: relative; z-index: 2; transform: translateY(30px); transition: transform 1s cubic-bezier(0.2, 0.8, 0.2, 1); width: 100%; max-width: 500px; display: flex; justify-content: center; padding: 0 20px; box-sizing: border-box;">
      <div style="
        background: rgba(255, 255, 255, 0.03); 
        backdrop-filter: blur(12px); 
        border: 1px solid rgba(255, 74, 117, 0.2); 
        padding: 40px 50px; 
        border-radius: 30px; 
        box-shadow: 0 20px 50px rgba(0,0,0,0.5), inset 0 0 20px rgba(255, 74, 117, 0.05); 
        text-align: center;
        display: flex; flex-direction: column; align-items: center;
        width: 100%;
        box-sizing: border-box;
      ">
        
        <div style="margin-bottom: 24px; animation: pulseGlow 2.5s infinite alternate;">
          <img src="loading/Pak.gif" alt="Cute Loop" style="
            width: 150px; 
            height: 150px; 
            object-fit: cover; 
            border-radius: 50%; 
            border: 3px solid rgba(255, 74, 117, 0.4);
            box-shadow: 0 10px 30px rgba(255, 74, 117, 0.3);
          " />
        </div>
        
        <h1 style="
          font-size: 2.8rem; font-weight: 800; margin: 0 0 12px; letter-spacing: 0.5px;
          background: linear-gradient(to right, #ffffff, #ff4a75);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: fadeInUp 0.8s ease forwards 0.2s; opacity: 0;
          line-height: 1.2;
        ">Welcome Home, Dipsu</h1>
        
        <p style="color: rgba(255,255,255,0.85); font-size: 1.15rem; margin: 0; animation: fadeInUp 0.8s ease forwards 0.6s; opacity: 0;">
          Preparing your cozy streaming bubble...
        </p>
        
        <div style="margin-top: 24px; padding: 8px 16px; background: rgba(255, 74, 117, 0.15); border-radius: 20px; animation: fadeInUp 0.8s ease forwards 1s; opacity: 0;">
          <span style="color: #ff4a75; font-size: 0.9rem; font-weight: 600; letter-spacing: 1px; text-transform: uppercase;">
            ✨ Made with love ✨
          </span>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);

  // 3. Inject critical CSS keyframes and mobile overrides
  const styleNode = document.createElement('style');
  styleNode.textContent = `
    @keyframes heartbeat { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.12); } }
    @keyframes pulseGlow { 0% { filter: drop-shadow(0 0 10px rgba(255, 74, 117, 0.4)); } 100% { filter: drop-shadow(0 0 30px rgba(255, 74, 117, 0.8)); } }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes floatUp {
      0% { transform: translateY(105vh) scale(0.5) rotate(0deg); opacity: 0; }
      15% { opacity: 0.5; }
      85% { opacity: 0.5; }
      100% { transform: translateY(-10vh) scale(1.3) rotate(20deg); opacity: 0; }
    }

    /* 📱 CRITICAL RESPONSIVE MOBILE FIXES */
    @media (max-width: 500px) {
      #eggContent > div {
        padding: 30px 24px !important; /* Prevents text from crowding borders */
        width: 100% !important;
      }
      #eggContent h1 {
        font-size: 2.0rem !important; /* Clean downscaling without broken text wrapping */
      }
      #eggContent p {
        font-size: 1.0rem !important;
      }
      #eggContent img {
        width: 120px !important;  /* Compact scale-down for mobile view */
        height: 120px !important;
      }
    }
  `;
  document.head.appendChild(styleNode);

  // 4. Populate dynamic floating background hearts
  for (let i = 0; i < 25; i++) {
    const heart = document.createElement('div');
    heart.textContent = '❤️';
    heart.style.cssText = `
      position: absolute; bottom: -50px; left: ${Math.random() * 100}vw;
      font-size: ${10 + Math.random() * 20}px; opacity: 0;
      animation: floatUp ${5 + Math.random() * 5}s linear infinite;
      animation-delay: ${Math.random() * 4}s; pointer-events: none; z-index: 1;
      filter: blur(${Math.random() > 0.5 ? '2px' : '0px'});
    `;
    overlay.appendChild(heart);
  }

  // 5. Smooth cinematic fade-in entry switch
  setTimeout(() => { 
    overlay.style.opacity = '1'; 
    overlay.querySelector('#eggContent')?.style?.setProperty('transform', 'translateY(0)');
  }, 50);

  // 6. Shift UI color engine system variables to pink for her session
  document.documentElement.style.setProperty('--accent', '#ff4a75'); 
  document.documentElement.style.setProperty('--accent-rgb', '255, 74, 117');

  // 7. Gracefully dissolve overlay panel back to homepage after 5.5s
  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.remove();
      
      // Call standard dashboard re-rendering checks safely
      if (typeof fetchWorkspaceData === 'function') fetchWorkspaceData();
      if (typeof showPremiumToast === 'function') showPremiumToast("Cozy streaming layout initialized. Grab a blanket!", "ph-heart");
    }, 1000);
  }, 5500);
}
// ==========================================================================
// ACCOUNT-ISOLATED HISTORY MANAGEMENT ENGINE (FIXED)
// ==========================================================================

// 🔑 HELPER: Dynamically detects your real active user to isolate history profiles
function getHistoryStorageKey() {
  const activeUserRaw = localStorage.getItem('bumblebee_active_user');
  let username = 'guest';

  if (activeUserRaw) {
    try {
      // If your login system saves it as a JSON object string
      const parsed = JSON.parse(activeUserRaw);
      username = parsed.username || parsed.name || activeUserRaw;
    } catch (e) {
      // If your login system saves it as a plain text string
      username = activeUserRaw;
    }
  }
  
  // Normalize the name to make it a clean storage key suffix
  const cleanUsername = String(username).trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `bumblebee_history_${cleanUsername}`;
}

// CORE FUNCTION: Saves any media to history and instantly updates the homepage UI
function saveMediaToHistory(mediaId, title, posterPath, mediaType, rating) {
  if (!mediaId) return;
  
  const storageKey = getHistoryStorageKey();
  let history = JSON.parse(localStorage.getItem(storageKey)) || [];
  history = history.filter(item => String(item.id) !== String(mediaId));
  
  // BULLETPROOFING THE IMAGE URL:
  let finalPoster = posterPath;
  if (posterPath && !posterPath.startsWith('http')) {
    const prefix = window.IMG_PATH_PREFIX || 'https://image.tmdb.org/t/p/w500';
    finalPoster = prefix + posterPath;
  }
  
  const playbackNode = {
    id: mediaId,
    title: title || 'Unknown Title',
    poster: finalPoster || 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=300',
    type: mediaType || 'movie',
    rating: rating || '7.5',
    timestamp: Date.now()
  };
  
  history.unshift(playbackNode); 
  localStorage.setItem(storageKey, JSON.stringify(history));
  renderContinueWatchingHistory();
}

// Render historical track items onto the layout shelf
function renderContinueWatchingHistory() {
  const section = document.getElementById('continueWatchingSection');
  
  const grid = document.getElementById('continueWatchingGrid');
  if (!grid || !section) return;

  const storageKey = getHistoryStorageKey();
  const history = JSON.parse(localStorage.getItem(storageKey)) || [];

  if (history.length === 0) {
    grid.innerHTML = '';
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  grid.innerHTML = '';

  history.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card-wrapper';
    card.innerHTML = `
        <div class="bento-card" style="cursor: pointer; position: relative;" onclick="launchDirectStream('${item.id}', '${item.type}')">
            <img src="${item.poster}" alt="${item.title}" style="width: 100%; border-radius: 12px; display: block; aspect-ratio: 2/3; object-fit: cover;">
            <span class="rating-badge" style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; color: #fbbf24;"><i class="ph-fill ph-star"></i> ${item.rating}</span>
            <button class="history-card-delete-trigger" title="Remove from history" onclick="event.stopPropagation(); removeMediaFromHistory('${item.id}')">
                <i class="ph-bold ph-trash"></i>
            </button>
        </div>
        <div class="card-meta-details" style="margin-top: 8px;">
            <span class="meta-type" style="font-size: 0.7rem; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block;">${item.type}</span>
            <span class="meta-title" style="font-size: 0.9rem; color: #fff; font-weight: 500; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</span>
        </div>
    `;
    grid.appendChild(card);
  });
}

// Delete individual item from tracking layout
function removeMediaFromHistory(mediaId) {
  const storageKey = getHistoryStorageKey();
  let history = JSON.parse(localStorage.getItem(storageKey)) || [];
  
  history = history.filter(item => String(item.id) !== String(mediaId));
  localStorage.setItem(storageKey, JSON.stringify(history));
  
  renderContinueWatchingHistory(); 
}

// Re-launch media immediately from history shelf click
function launchDirectStream(id, type) {
  window.currentActiveMediaId = id;
  if (typeof window.loadCinemaMedia === 'function') {
    window.loadCinemaMedia(id, type);
  } else {
    const frame = document.getElementById('videoPlayerFrame');
    if (frame) {
      frame.src = `https://vidlink.pro/${type}/${id}`;
      const panel = document.getElementById('cinemaPlayerPanel');
      const primary = document.getElementById('primaryGridPanel');
      if (panel) panel.style.display = 'block';
      if (primary) primary.style.display = 'none';
    }
  }
}

// ==========================================================================
// FORCE SIDEBAR NAVIGATION OVERRIDE
// ==========================================================================
document.addEventListener('click', (e) => {
    // 1. Find if the user clicked something inside your sidebar navigation
    const clickedNavItem = e.target.closest('.sidebar-menu div, .sidebar-link, [class*="nav"], a');
    if (!clickedNavItem) return;

    const section = document.getElementById('continueWatchingSection');
    if (!section) return;

    // Get the clean text string of what tab was clicked
    const tabName = clickedNavItem.textContent.trim().toLowerCase();

    // 2. If it's a known non-Home menu tab, smash hide it instantly
    if (tabName.includes('tv show') || 
        tabName.includes('movie') || 
        tabName.includes('k-drama') || 
        tabName.includes('anime') || 
        tabName.includes('list')) {
        
        section.classList.add('hidden');
        section.style.setProperty('display', 'none', 'important');
    } 
    // 3. Otherwise, if they went back to Home, re-evaluate and show it
    else if (tabName.includes('home')) {
        setTimeout(() => {
            if (typeof renderContinueWatchingHistory === 'function') {
                section.style.removeProperty('display');
                renderContinueWatchingHistory();
            }
        }, 30); // 30ms breather to let your page clear
    }
});

// ==========================================================================
// BUMBLEBEE ARCHITECTURE PATCH SYSTEM
// ==========================================================================

/* 1. ARCHITECTURAL FIX: EXCLUSIVE CONTINUE WATCHING VISIBILITY RULE */
function forceContinueWatchingVisibilitySync() {
  const section = document.getElementById('continueWatchingSection');
  if (!section) return;

  // Track the desktop sidebar links and mobile navigation layout tags
  const activeDesktopLink = document.querySelector('.vertical-navigation-menu .menu-link.active');
  const activeMobileLink = document.querySelector('.mobile-bottom-nav .nav-item.active');

  let activeViewName = '';
  if (activeDesktopLink) activeViewName = activeDesktopLink.textContent.trim().toLowerCase();
  else if (activeMobileLink) activeViewName = activeMobileLink.textContent.trim().toLowerCase();

  // If the active menu element is anything other than 'home', force visibility out
  if (activeViewName && !activeViewName.includes('home')) {
    section.classList.add('hidden');
    section.style.setProperty('display', 'none', 'important');
  } else {
    // If returning home, check local storage history array size before rendering back
    const storageKey = typeof getHistoryStorageKey === 'function' ? getHistoryStorageKey() : 'media_history';
    const history = JSON.parse(localStorage.getItem(storageKey)) || [];
    if (history.length > 0) {
      section.classList.remove('hidden');
      section.style.removeProperty('display');
    }
  }
}

// Hook directly into app interactions to intercept state changes
document.addEventListener('click', () => {
  setTimeout(forceContinueWatchingVisibilitySync, 40);
});

/* 2. ENGINE FIX: REAL-TIME SERVERLESS WATCH PARTY (PEERJS) */
let partyPeerInstance = null;
let partyDataConnection = null;
let targetIncomingBufferOverride = false;

function toggleWatchPartyPanel() {
  const deck = document.getElementById('watchPartyConsoleDeck');
  if (deck) deck.classList.toggle('hidden');
}

// Host Workflow
function initiateHostParty() {
  partyPeerInstance = new Peer();
  
  partyPeerInstance.on('open', (id) => {
    updatePartyPanelState(id);
  });

  partyPeerInstance.on('connection', (connection) => {
    partyDataConnection = connection;
    bindPartyDataStreams();
  });
}

// Guest Workflow
function initiateGuestParty() {
  const codeInput = document.getElementById('partyJoinIdInput').value.trim();
  if (!codeInput) return;

  partyPeerInstance = new Peer();
  
  partyPeerInstance.on('open', () => {
    partyDataConnection = partyPeerInstance.connect(codeInput);
    bindPartyDataStreams();
    updatePartyPanelState(codeInput);
  });
}

// Update Panel View States
function updatePartyPanelState(roomId) {
  document.getElementById('partyInitView').classList.add('hidden');
  const activeView = document.getElementById('partyActiveView');
  activeView.classList.remove('hidden');
  document.getElementById('partyCodeDisplay').innerText = `ROOM: ${roomId}`;
  window.currentWatchPartyRoomId = roomId;
}

function copyPartyCode() {
  if (window.currentWatchPartyRoomId) {
    navigator.clipboard.writeText(window.currentWatchPartyRoomId);
    alert("Room ID copied to clipboard! Share it with your friend.");
  }
}

// Bind Stream Sync Receivers
function bindPartyDataStreams() {
  const statusLabel = document.querySelector('.party-status-indicator');
  if (statusLabel) statusLabel.innerHTML = '<span class="pulse-dot"></span> Friends Connected!';

  partyDataConnection.on('data', (payload) => {
    const playerFrame = document.getElementById('videoPlayerFrame');
    if (!playerFrame || !payload) return;

    targetIncomingBufferOverride = true; // Block local event loopback echoes
    
    // Globally sync standard media parameters
    window.currentActiveMediaId = payload.mediaId;
    playerFrame.src = payload.serverUrl;
    
    const titleHeader = document.getElementById('cinemaMovieTitle');
    if (titleHeader && payload.title) titleHeader.innerText = payload.title;

    setTimeout(() => { targetIncomingBufferOverride = false; }, 1000);
  });
}

// Outbound Transmission Hook: Monitor when user switches streams or servers
document.addEventListener('click', (e) => {
  if (targetIncomingBufferOverride || !partyDataConnection) return;

  // Check if user clicked a server routing button or media element launch card
  const isServerBtn = e.target.closest('.server-btn');
  const isMediaCard = e.target.closest('[onclick*="launchDirectStream"]');

  if (isServerBtn || isMediaCard) {
    setTimeout(() => {
      const playerFrame = document.getElementById('videoPlayerFrame');
      const titleHeader = document.getElementById('cinemaMovieTitle');
      if (!playerFrame) return;

      partyDataConnection.send({
        mediaId: window.currentActiveMediaId || '',
        serverUrl: playerFrame.src,
        title: titleHeader ? titleHeader.innerText : ''
      });
    }, 200); // 200ms grace period lets execution functions map source changes first
  }
});

function triggerHeartRain(event) {
  const heartSource = event.target;
  
  if (window.isHeartStreamActive) return;
  window.isHeartStreamActive = true;

  // Visual bounce on click
  heartSource.style.transform = "scale(1.6) rotate(-15deg)";
  setTimeout(() => { heartSource.style.transform = "scale(1)"; }, 200);

  // Time Calculator Engine
  const anniversaryDate = new Date("2024-09-11T00:00:00");
  const currentDate = new Date();
  const timeDifference = currentDate.getTime() - anniversaryDate.getTime();
  const totalDaysTogether = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

  // Days Badge Code
  const badge = document.createElement("div");
  badge.className = "gf-days-live-badge";
  badge.innerHTML = `<i class="ph-fill ph-sparkles"></i> ${totalDaysTogether} DAYS💛`;
  badge.style.left = `${event.clientX}px`;
  badge.style.top = `${event.clientY - 40}px`;
  document.body.appendChild(badge);
  setTimeout(() => { badge.remove(); }, 4000);

  // NEW FOOLPROOF CONFETTI FOUNTAIN
  const totalHearts = 40;
  let spawned = 0;

  const streamInterval = setInterval(() => {
    if (spawned >= totalHearts) {
      clearInterval(streamInterval);
      window.isHeartStreamActive = false;
      return;
    }

    const heart = document.createElement("i");
    heart.className = "ph-fill ph-heart rain-heart-particle";
    
    // Track exact mouse position for standard placement
    heart.style.left = `${event.clientX}px`;
    heart.style.top = `${event.clientY}px`;
    
    // Varied sizing
    const size = Math.random() * 20 + 14; 
    heart.style.fontSize = `${size}px`;

    // Direct variable injects for clean drift spreads
    const randomDriftX = (Math.random() - 0.5) * 400; // Spreads them 200px left and 200px right
    const randomRotation = (Math.random() - 0.5) * 360;

    heart.style.setProperty('--drift-x', `${randomDriftX}px`);
    heart.style.setProperty('--rot-end', `${randomRotation}deg`);

    // Dynamic speeds for true confetti depth look
    const speed = Math.random() * 1 + 1.5; 
    heart.style.animationDuration = `${speed}s`;

    document.body.appendChild(heart);

    setTimeout(() => { heart.remove(); }, speed * 1000);
    spawned++;
  }, 40); // Rapid fire stream
}

// ==========================================================================
// ENGINE CORE: FOOTER HEART RAIN AND SEARCH INTERCEPTOR
// ==========================================================================

function triggerHeartRain(event) {
  const heartSource = event.target;
  if (window.isHeartStreamActive) return;
  window.isHeartStreamActive = true;

  heartSource.style.transform = "scale(1.6) rotate(-15deg)";
  setTimeout(() => { heartSource.style.transform = "scale(1)"; }, 200);

  // Time Engine Math
  const anniversaryDate = new Date("2024-09-11T00:00:00");
  const currentDate = new Date();
  const timeDifference = currentDate.getTime() - anniversaryDate.getTime();
  const totalDaysTogether = Math.floor(timeDifference / (1000 * 60 * 60 * 24));

  // Build Flying Badge
  const badge = document.createElement("div");
  badge.className = "gf-days-live-badge";
  badge.innerHTML = `<i class="ph-fill ph-sparkles"></i> ${totalDaysTogether} DAYS WITH YOU 💛`;
  badge.style.left = `${event.clientX}px`;
  badge.style.top = `${event.clientY - 40}px`;
  document.body.appendChild(badge);
  setTimeout(() => { badge.remove(); }, 4000);

  // Confetti Stream Engine
  const totalHearts = 40;
  let spawned = 0;
  const streamInterval = setInterval(() => {
    if (spawned >= totalHearts) {
      clearInterval(streamInterval);
      window.isHeartStreamActive = false;
      return;
    }

    const heart = document.createElement("i");
    heart.className = "ph-fill ph-heart rain-heart-particle";
    heart.style.left = `${event.clientX}px`;
    heart.style.top = `${event.clientY}px`;
    
    const size = Math.random() * 20 + 14; 
    heart.style.fontSize = `${size}px`;

    const randomDriftX = (Math.random() - 0.5) * 400; 
    const randomRotation = (Math.random() - 0.5) * 360;
    heart.style.setProperty('--drift-x', `${randomDriftX}px`);
    heart.style.setProperty('--rot-end', `${randomRotation}deg`);

    const speed = Math.random() * 1 + 1.5; 
    heart.style.animationDuration = `${speed}s`;

    document.body.appendChild(heart);
    setTimeout(() => { heart.remove(); }, speed * 1000);
    spawned++;
  }, 40);
}

function checkSearchForAnniversary(queryText, targetGridId) {
  if (!queryText) return false;
  const cleanQuery = queryText.toLowerCase().trim();
  
  if (
    cleanQuery === "09-11" || cleanQuery === "9/11" || cleanQuery === "09/11" ||
    cleanQuery === "2024-09-11" || cleanQuery === "september 11" || cleanQuery === "sept 11"
  ) {
    const displayContainer = document.getElementById(targetGridId);
    if (displayContainer) {
      displayContainer.style.display = "none"; 

      let customOverrideWrapper = document.getElementById("secretBentoOverrideGrid");
      if (!customOverrideWrapper) {
        customOverrideWrapper = document.createElement("div");
        customOverrideWrapper.id = "secretBentoOverrideGrid";
        displayContainer.parentNode.insertBefore(customOverrideWrapper, displayContainer.nextSibling);
      }

      // Applied layout wrappers via structural CSS styling safely
      customOverrideWrapper.style.display = "flex";
      customOverrideWrapper.style.justifyContent = "center";
      customOverrideWrapper.style.width = "100%";
      customOverrideWrapper.style.padding = "30px 0";

      // Rebuilt template strings to accept responsive classes natively
      customOverrideWrapper.innerHTML = `
        <div class="premium-secret-bento-node" onclick="openSecretLoveCapsule()">
          <div class="poster-wrapper" style="border: 2px solid #f43f5e; box-shadow: 0 0 30px rgba(244, 63, 94, 0.6); position: relative; border-radius: 16px; overflow: hidden; width: 100%; aspect-ratio: 2/3; background: #160d21;">
            <div style="position: absolute; top: 15px; right: 15px; z-index: 10; background: #f43f5e; border: 1px solid #fff; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 10px rgba(244,63,94,0.5);">
              <i class="ph-fill ph-heart" style="color: #fff; font-size: 1.1rem;"></i>
            </div>
            <img src="loading/thumbnail.jpg" alt="Matrix Element" style="width: 100%; height: 100%; object-fit: cover; display: block;">
          </div>
          <div style="padding: 12px 4px; text-align: left;">
            <h4 style="color: #fda4af; margin: 0; font-size: 1rem; font-weight: 700; font-family: sans-serif;">My Favorite Plot Twist</h4>
            <div style="font-size: 0.8rem; color: rgba(255,255,255,0.5); margin-top: 4px; font-family: sans-serif;">
              <span>2024</span> • <span style="color: #f43f5e; font-weight: bold;">System Favorite</span>
            </div>
          </div>
        </div>
      `;
      
      const heading = document.getElementById('resultsHeading');
      if (heading) heading.textContent = "✨ SECURE ARCHIVE FOUND ✨";
    }
    return true; 
  } else {
    const customOverrideWrapper = document.getElementById("secretBentoOverrideGrid");
    if (customOverrideWrapper) customOverrideWrapper.style.display = "none";
    
    const displayContainer = document.getElementById(targetGridId);
    if (displayContainer) displayContainer.style.display = ""; 
  }
  return false; 
}



// ==========================================================================
// FULL-SCREEN GALLERY & AUDIO CONTROLS
// ==========================================================================

function openSecretLoveCapsule() {
  const modal = document.getElementById("secretCapsuleModal");
  const bgm = document.getElementById("romanceBGM");
  const disc = document.getElementById("musicDisc");

  if (modal) {
    // Add the active class instead to trigger the CSS animations!
    modal.classList.add("active"); 
    
    if (bgm) {
      bgm.play().catch(e => console.log("Audio autoplay blocked.", e));
      if (disc) disc.classList.add("spinning");
    }
  }
}

function closeSecretLoveCapsule() {
  const modal = document.getElementById("secretCapsuleModal");
  const bgm = document.getElementById("romanceBGM");
  const disc = document.getElementById("musicDisc");

  if (modal) {
    // Remove the active class to trigger the fade-out
    modal.classList.remove("active");
    
    if (bgm) {
      bgm.pause();
      bgm.currentTime = 0; 
      if (disc) disc.classList.remove("spinning");
    }
  }
}

function toggleBGM() {
  const bgm = document.getElementById("romanceBGM");
  const disc = document.getElementById("musicDisc");
  
  if (!bgm || !disc) return;

  if (bgm.paused) {
    bgm.play();
    disc.classList.add("spinning");
  } else {
    bgm.pause();
    disc.classList.remove("spinning");
  }
}

// ==========================================================================
// 1. RUN THIS AUTOMATICALLY AFTER THE PAGE RELOADS
// ==========================================================================
document.addEventListener("DOMContentLoaded", () => {
  // Grab the username out of local storage that was saved during login
  const savedUser = localStorage.getItem('bumblebee_active_user'); 
  
  if (savedUser) {
    // Pass "Dipsu" into your function cleanly after the page boots up!
    handleUserLoginSession(savedUser);
  }
});

// ==========================================================================
// 2. UPDATED INJECTOR FUNCTION (Targeting profileDropdownPlate)
// ==========================================================================
function handleUserLoginSession(loggedInUsername) {
  const cleanUser = loggedInUsername.toLowerCase().trim();
  
  // Cleaned up case sensitivity matching to lower-case "dipsu"
  if (cleanUser === "dipsu") {
    // Targets the exact dropdown menu visible in your dev tools
    const profilePanel = document.getElementById("profileDropdownPlate");
    
    if (profilePanel) {
      // Safety check so we don't accidentally inject multiple duplicate buttons
      if (!document.querySelector(".forbidden-system-btn")) {
        const trapButton = document.createElement("div");
        trapButton.style.padding = "12px 16px";
        trapButton.style.textAlign = "center";
        trapButton.style.borderBottom = "1px solid rgba(255, 255, 255, 0.08)";
        trapButton.innerHTML = `
          <button class="forbidden-system-btn" onclick="triggerSystemDecompilationSequence()" style="width: 100%;">
            ⚠️ DO NOT PRESS ME
          </button>
        `;
        // Prepend it so it sits proudly right at the very top of her active dropdown settings
        profilePanel.insertBefore(trapButton, profilePanel.firstChild);
      }
    } else {
      // If the dropdown isn't open yet, check again in 400ms to catch it when clicked
      setTimeout(() => {
        handleUserLoginSession(loggedInUsername);
      }, 400);
    }
  }
}

// ==========================================================================
// 3. YOUR GLITCH MECHANICS WORKSPACE FUNCTIONS (Unchanged)
// ==========================================================================
function triggerSystemDecompilationSequence() {
  const bodyElement = document.body;
  const glitchSound = document.getElementById("glitchAudioNode");
  const matrixOverlay = document.getElementById("secureMatrixOverlay");

  // 1. Play glitch track
  if (glitchSound) {
    glitchSound.currentTime = 0;
    glitchSound.play().catch(e => console.log("Audio contextual lock handled."));
  }

  // 2. Start the rhythmic layout warp
  bodyElement.classList.add("glitch-screen-active");

  // 3. Pitch black window transition sequence
  setTimeout(() => {
    // Stop the glitch distortion instantly (Screen naturally hits pitch black background overlay state)
    bodyElement.classList.remove("glitch-screen-active");
    
    if (matrixOverlay) {
      // Activate overlay container — CSS handles staggered animations automatically!
      matrixOverlay.classList.add("reveal-active");
    }
  }, 1600); // 1.6 Seconds duration for the initial static surge
}

function closeSecureMatrixSystem() {
  const matrixOverlay = document.getElementById("secureMatrixOverlay");
  if (matrixOverlay) {
    matrixOverlay.classList.remove("reveal-active");
  }
}