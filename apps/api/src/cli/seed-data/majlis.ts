import type { ShowroomGroup } from './showroom';

// The shop's majlis photos (2026-11): Moroccan-style floor seating in velvet with lustrous jacquard
// ends, back cushions and bolsters. Each colourway has a close-up (cards) and the whole set.
export const MAJLIS: ShowroomGroup = {
  category: 'majlis-covers',
  imageDir: 'majlis',
  products: [
    {
      ar: 'طقم جلسة أرضية مغربية بالمخمل والجاكار',
      en: 'Moroccan Majlis Set in Velvet and Jacquard',
      descAr: 'جلسة أرضية بطابع مغربي: مقاعد من المخمل الناعم تحيط بها أطراف من الجاكار اللامع بنقوش دمشقية، مع مساند ظهر ومخدات ومراكي متناسقة بأحجام مختلفة، وقاعدة بإطار مزخرف. متوفرة بعدة ألوان وتُفصّل على مقاس المجلس.',
      descEn: 'Moroccan-style floor seating: soft velvet seats framed by lustrous damask jacquard ends, with matching back cushions, throw pillows and bolsters in several sizes on a decorated base. Available in a range of colourways and tailored to the size of your majlis.',
      colors: {
        blue: ['majlis-blue-detail.jpg', 'majlis-blue-full.jpg'],
        green: ['majlis-green-detail.jpg', 'majlis-green-full.jpg'],
        burgundy: ['majlis-burgundy-detail.jpg', 'majlis-burgundy-full.jpg'],
        purple: ['majlis-purple-detail.jpg', 'majlis-purple-full.jpg'],
        brown: ['majlis-brown-detail.jpg', 'majlis-brown-full.jpg'],
        teal: ['majlis-turquoise-detail.jpg', 'majlis-turquoise-full.jpg'],
        rose: ['majlis-pink-detail.jpg', 'majlis-pink-full.jpg'],
        charcoal: ['majlis-grey-detail.jpg', 'majlis-grey-full.jpg'],
      },
      attrs: { cover_type: ['tailored'] },
      price: 2999,
    },
  ],
};
