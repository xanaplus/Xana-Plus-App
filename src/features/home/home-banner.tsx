import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';

import { Txt } from '@/components/ui';
import { figmaAsset } from '@/data/images';
import { fetchHomeSlides, type ShownSlide, type SlideDivision, type SlideTone } from '@/data/home-slides';
import { useLive } from '@/data/live-catalogue';
import type { CategoryVertical, Product } from '@/data/types';
import { formatKes } from '@/lib/format';
import { useStoreStock } from '@/store/fulfilment';
import { radius, spacing } from '@/theme';
import { useTheme } from '@/theme/provider';

/** The website's slide colours (Web2 index.html `.offer-slide.tone-*`), so a banner looks the same on both. */
const TONES: Record<SlideTone, { background: string; panel: string; text: string; ctaBackground: string; ctaText: string }> = {
  green: { background: '#046938', panel: 'rgba(4, 105, 56, 0.88)', text: '#ffffff', ctaBackground: '#ffffff', ctaText: '#035A30' },
  ink: { background: '#0A1510', panel: 'rgba(10, 21, 16, 0.82)', text: '#ffffff', ctaBackground: '#ffffff', ctaText: '#035A30' },
  gold: { background: '#F79F26', panel: 'rgba(247, 159, 38, 0.92)', text: '#1B1204', ctaBackground: '#1B1204', ctaText: '#ffffff' },
};

const DIVISION_VERTICAL: Record<SlideDivision, CategoryVertical> = {
  Pharmacy: 'pharmacy',
  Retail: 'retail',
  Deli: 'deli',
  Wholesale: 'wholesale',
};

/** A slide stays 6.5 s, as on the website. */
const SLIDE_MS = 6500;
/** After a swipe, the banner waits this long before moving on by itself. */
const RESUME_MS = 12000;
/** One height for every slide, close to a retail app's banner, so the page never jumps. */
const BANNER_HEIGHT = 190;
const EMPTY: ShownSlide[] = [];

type Slide = ShownSlide & { price?: { amount: number; from: boolean } };

/**
 * The same ad rules as the website: a prescription-only or out-of-stock item is
 * never advertised, and a slide whose items are all unavailable is not shown.
 * The price line is the cheapest available item ("From" when they differ).
 */
function useShownSlides(slides: ShownSlide[]): Slide[] {
  const stock = useStoreStock();
  const allowed = (product?: Product) => !!product && !product.rxRequired && stock.inStock(product);
  return slides.flatMap(slide => {
    const { link } = slide;
    if (link.kind === 'product' && !allowed(slide.products.find(p => p.id === link.item))) return [];
    if (slide.skus.length === 0) return [slide];
    const available = slide.products.filter(p => slide.skus.includes(p.id) && allowed(p));
    if (available.length === 0) return [];
    const cheapest = Math.min(...available.map(p => p.price));
    return [{ ...slide, price: { amount: cheapest, from: available.some(p => p.price !== cheapest) } }];
  });
}

/** A product opens its page, an aisle its search shelf, a department the Categories tab. */
function openSlide(router: ReturnType<typeof useRouter>, { link }: Slide) {
  if (link.kind === 'product') router.push(`/product/${link.item}`);
  else if (link.kind === 'category') router.push({ pathname: '/search', params: { q: link.category } });
  else router.push({ pathname: '/(tabs)/categories', params: { vertical: DIVISION_VERTICAL[link.division], t: String(Date.now()) } });
}

/**
 * Home's banner: the admin app's Homepage ads, shared with the website. Swipe or
 * wait; tapping a slide opens its product, aisle or department. Hidden when there
 * are no live slides or they cannot be read.
 */
export function HomeBanner({ width }: { width: number }) {
  const { colors } = useTheme();
  const router = useRouter();
  const live = useLive('home-slides', fetchHomeSlides, EMPTY);
  const slides = useShownSlides(live.data);
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const resumeAt = useRef(0);
  const count = slides.length;

  useEffect(() => {
    if (count < 2) return;
    const timer = setInterval(() => {
      if (Date.now() < resumeAt.current) return;
      setIndex(current => {
        const next = (current + 1) % count;
        scroller.current?.scrollTo({ x: next * width, animated: true });
        return next;
      });
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [count, width]);

  if (live.status === 'loading') {
    return <View style={[styles.skeleton, { width, backgroundColor: colors.surfaceContainerLow }]} />;
  }
  if (count === 0) return null;

  const onSwipeEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View>
      <ScrollView
        ref={scroller}
        horizontal
        // Snap rather than pagingEnabled: on the web that wraps each slide in a box, so slides can't stretch.
        snapToInterval={width}
        decelerationRate="fast"
        disableIntervalMomentum
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (resumeAt.current = Date.now() + RESUME_MS)}
        onMomentumScrollEnd={onSwipeEnd}
        style={[styles.clip, { width }]}
      >
        {slides.map((slide, position) => (
          <Pressable
            key={slide.id}
            accessibilityRole="button"
            accessibilityLabel={`${slide.title}. ${slide.cta}. Slide ${position + 1} of ${count}`}
            onPress={() => openSlide(router, slide)}
            style={{ width }}
          >
            <SlideView slide={slide} />
          </Pressable>
        ))}
      </ScrollView>
      {count > 1 ? (
        <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {slides.map((slide, position) => (
            <View
              key={slide.id}
              style={[
                styles.dot,
                position === index ? [styles.dotOn, { backgroundColor: colors.primary }] : { backgroundColor: colors.outlineVariant },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SlideView({ slide }: { slide: Slide }) {
  const tone = TONES[slide.tone];
  const photo = slide.image ? (
    <Image
      source={{ uri: slide.image }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      contentPosition={slide.focus}
      accessibilityLabel={slide.alt || undefined}
      transition={140}
    />
  ) : null;

  if (slide.layout === 'split') {
    return (
      <View style={[styles.slide, styles.split, { backgroundColor: tone.background }]}>
        <View style={styles.half}>{photo}</View>
        <View style={[styles.half, styles.words]}>
          <Copy slide={slide} />
        </View>
      </View>
    );
  }

  if (slide.layout === 'full') {
    return (
      <View style={[styles.slide, styles.full, { backgroundColor: tone.background }]}>
        {photo}
        <View style={[styles.panel, { backgroundColor: tone.panel }]}>
          <Copy slide={slide} />
        </View>
      </View>
    );
  }

  // Card: the slide's own picture (cropped) or the cheapest item's photo (never cropped).
  const product = slide.products.find(p => p.id === (slide.link.kind === 'product' ? slide.link.item : slide.skus[0]));
  const productPhoto = product ? figmaAsset(product.image) : undefined;
  return (
    <View style={[styles.slide, styles.card, { backgroundColor: tone.background }]}>
      <View style={styles.cardArt}>
        {photo ?? (productPhoto ? <Image source={productPhoto} style={styles.productPhoto} contentFit="contain" /> : null)}
      </View>
      <View style={styles.words}>
        <Copy slide={slide} />
      </View>
    </View>
  );
}

/**
 * Label, title, price and a small button. The body text is left out on a phone so
 * the banner stays short, as retail apps keep theirs; the website shows it.
 */
function Copy({ slide }: { slide: Slide }) {
  const tone = TONES[slide.tone];
  return (
    <View style={styles.copy}>
      {slide.label ? (
        <Txt variant="labelSm" tint={tone.text} numberOfLines={1} style={styles.label}>
          {slide.label}
        </Txt>
      ) : null}
      <Txt variant="title" tint={tone.text} numberOfLines={2}>
        {slide.title}
      </Txt>
      {slide.price ? (
        <Txt variant="titleSm" tint={tone.text} numberOfLines={1}>
          {slide.price.from ? 'From ' : ''}
          {formatKes(slide.price.amount)}
        </Txt>
      ) : null}
      <View style={[styles.cta, { backgroundColor: tone.ctaBackground }]}>
        <Txt variant="labelSm" tint={tone.ctaText} numberOfLines={1}>
          {slide.cta}
        </Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: { height: BANNER_HEIGHT, borderRadius: radius.card },
  clip: { borderRadius: radius.card },
  slide: { height: BANNER_HEIGHT, overflow: 'hidden' },
  split: { flexDirection: 'row' },
  half: { flex: 1 },
  full: { justifyContent: 'flex-end', alignItems: 'flex-start', padding: spacing.sm },
  panel: { maxWidth: '68%', padding: spacing.md, borderRadius: radius.lg },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  cardArt: { width: 120, height: 120, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: '#ffffff' },
  productPhoto: { flex: 1, margin: spacing.sm },
  words: { flex: 1, minWidth: 0, justifyContent: 'center', padding: spacing.md },
  copy: { gap: spacing.xxs, alignItems: 'flex-start' },
  label: { opacity: 0.85 },
  cta: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2, borderRadius: radius.pill },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { width: 22 },
});
