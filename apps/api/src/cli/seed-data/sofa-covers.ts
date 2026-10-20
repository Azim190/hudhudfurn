import type { ShowroomGroup } from './showroom';

// Supplier photos. Throw-style covers laid over the seat, back and arms, sold by sofa size.
const COVER = { '1_seat': 99, '2_seat': 149, '3_seat': 199, l_shape: 299 };
const COVER_SET = { '1_seat': 149, '2_seat': 219, '3_seat': 279, l_shape: 399 };

export const SOFA_COVERS: ShowroomGroup = {
  category: 'sofa-covers',
  imageDir: 'sofa-covers',
  sizeAxis: 'seat_config',
  products: [
    {
      ar: 'غطاء كنب شانيل بإطار يوناني مع أكياس مخدات',
      en: 'Greek Key Chenille Sofa Cover with Cushion Covers',
      descAr: 'غطاء مقعد من الشانيل الناعم بحافة مطرزة بنقشة المفتاح اليوناني، مع أكياس مخدات متناسقة بشريط عرضي.',
      descEn: 'A soft chenille seat cover edged with a woven Greek-key border, with matching cushion covers banded in the same trim.',
      colors: {
        black: ['01.jpg'],
        brown: ['02.jpg'],
        ivory: ['04.jpg'],
        grey: ['05.jpg'],
        gold: ['08.jpg'],
        teal: ['09.jpg'],
      },
      attrs: { cover_type: ['tailored'] },
      sizes: COVER_SET,
    },
    {
      ar: 'غطاء كنب مخمل مموج بإطار يوناني ذهبي',
      en: 'Crushed Velvet Sofa Cover with Gold Greek Key',
      descAr: 'مخمل مموج بلمعة فاخرة وحافة ذهبية وسوداء بنقشة المفتاح اليوناني، مع غطاء للمسند.',
      descEn: 'Lustrous crushed velvet with a gold-and-black Greek-key border, plus a matching backrest cover.',
      colors: { purple: ['06.jpg'] },
      attrs: { cover_type: ['tailored'] },
      sizes: COVER,
    },
    {
      ar: 'طقم غطاء كنب بشرائط متقاطعة لامعة',
      en: 'Ribbon-Cross Sofa Cover Set',
      descAr: 'قطع منفصلة للمقعد والمساند والذراعين تزينها شرائط ذهبية لامعة متقاطعة، تلبس فوق الكنب بسهولة.',
      descEn: 'Separate seat, backrest and arm pieces decorated with crossed shimmering gold ribbon that lay easily over the sofa.',
      colors: { beige: ['03.jpg'], black: ['07.jpg'] },
      attrs: { cover_type: ['tailored'] },
      sizes: COVER_SET,
    },
    {
      ar: 'غطاء كنب بدانتيل وكرات صوف',
      en: 'Lace & Pompom Trim Sofa Cover',
      descAr: 'غطاء مقعد بلون رملي بحافة دانتيل بيضاء وشريط كرات صوف صغيرة، مع أكياس مخدات متناسقة.',
      descEn: 'A sand-coloured seat cover finished with white lace and a mini-pompom trim, with matching cushion covers.',
      colors: { beige: ['10.jpg'] },
      attrs: { cover_type: ['tailored'] },
      sizes: COVER,
    },
    {
      ar: 'غطاء كنب رمادي بحافة دانتيل',
      en: 'Lace-Edged Sofa Cover',
      descAr: 'غطاء رمادي فاتح بحواف دانتيل بيضاء على المقعد والمسند والذراعين، مع كيس مخدة متناسق.',
      descEn: 'A light grey cover with white lace edging on the seat, backrest and arms, plus a matching cushion cover.',
      colors: { grey: ['11.jpg'] },
      attrs: { cover_type: ['tailored'] },
      sizes: COVER,
    },
    {
      ar: 'غطاء كنب مبطن مضاد للخدش بتطريز دانتيل',
      en: 'Quilted Scratch-Resistant Sofa Cover with Lace Embroidery',
      descAr: 'غطاء مبطن متين يحمي الكنب من الخدوش، بتطريز دانتيل على الحواف والمسند وكيس مخدة متناسق.',
      descEn: 'A durable quilted cover that protects against scratches, with lace embroidery along the edges and backrest and a matching cushion cover.',
      colors: { charcoal: ['12.jpg'] },
      attrs: { cover_type: ['tailored'], pet_friendly: ['yes'] },
      sizes: COVER,
    },
  ],
};
