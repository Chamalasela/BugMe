const toggleButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');

if (toggleButton && nav) {
  toggleButton.addEventListener('click', () => {
    const isOpen = nav.classList.toggle('open');
    toggleButton.setAttribute('aria-expanded', String(isOpen));
  });

  nav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggleButton.setAttribute('aria-expanded', 'false');
    });
  });
}

const revealElements = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window && revealElements.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  revealElements.forEach((element, index) => {
    element.style.transitionDelay = `${Math.min(index * 60, 260)}ms`;
    observer.observe(element);
  });
} else {
  revealElements.forEach((element) => element.classList.add('is-visible'));
}

const screenshotImages = document.querySelectorAll('.screenshot-image');
const lightbox = document.querySelector('.screenshot-lightbox');
const lightboxImage = document.querySelector('.lightbox-image');
const lightboxClose = document.querySelector('.lightbox-close');

function closeLightbox() {
  if (!lightbox || !lightboxImage) return;
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  lightboxImage.setAttribute('src', '');
  lightboxImage.setAttribute('alt', '');
}

if (screenshotImages.length > 0 && lightbox && lightboxImage && lightboxClose) {
  screenshotImages.forEach((image) => {
    image.addEventListener('click', () => {
      const src = image.getAttribute('src');
      const alt = image.getAttribute('alt') || 'Expanded screenshot';
      if (!src) return;
      lightboxImage.setAttribute('src', src);
      lightboxImage.setAttribute('alt', alt);
      lightbox.classList.add('open');
      lightbox.setAttribute('aria-hidden', 'false');
    });
  });

  lightboxClose.addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && lightbox.classList.contains('open')) {
      closeLightbox();
    }
  });
}
