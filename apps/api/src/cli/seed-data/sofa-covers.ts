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
      // The shop's own photos (2026-11): scalloped-edge seat covers in embossed velvet.
      ar: 'غطاء مقعد كنب مخمل منقوش بحواف مموجة',
      en: 'Scalloped-Edge Embossed Velvet Seat Cover',
      descAr: 'غطاء لمقعد الكنب من المخمل الناعم بنقشة شبكية بارزة، بحواف مموجة على شكل أقواس تمنحه لمسة فاخرة. يُفرش فوق المقعد مباشرة ويحميه من البقع والاستعمال اليومي.',
      descEn: 'A soft velvet seat cover with a raised lattice emboss and scalloped, petal-shaped edges. It lays straight over the seat and protects it from spills and daily wear.',
      colors: {
        grey: ['scallop-grey-sofa.jpg', 'scallop-grey-fabric.jpg'],
        royal_blue: ['scallop-royal-blue-sofa.jpg', 'scallop-royal-blue-fabric.jpg'],
        charcoal: ['scallop-charcoal-fabric.jpg'],
        beige: ['scallop-beige-fabric.jpg'],
      },
      attrs: { cover_type: ['tailored'] },
      sizes: COVER,
    },
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

// The shop's own photos (2026-11): decorative velvet cushions with a crystal button, shown on the
// sofas they dress. One group photo shows several colours, so some colourways have no photo of their own.
export const SOFA_CUSHIONS: ShowroomGroup = {
  category: 'sofa-covers',
  imageDir: 'sofa-covers',
  products: [
    {
      ar: 'مخدة مخمل على شكل وردة بزر كريستال',
      en: 'Flower-Shaped Velvet Cushion with Crystal Button',
      descAr: 'مخدة ديكور من المخمل الناعم على شكل وردة بثماني بتلات، يتوسطها زر كريستالي لامع. تضيف لمسة لون أنيقة إلى الكنب والكراسي الكلاسيكية.',
      descEn: 'A soft velvet decorative cushion shaped like an eight-petal flower, finished with a sparkling crystal button. Adds an elegant touch of colour to classic sofas and armchairs.',
      colors: {
        grey: ['flower-cushions-chairs.jpg'],
        dark_green: ['flower-cushion-dark-green-chair.jpg', 'flower-cushion-dark-green-sofa.jpg'],
        beige: [],
        navy: [],
        royal_blue: [],
      },
      price: 59,
    },
    {
      ar: 'مخدة مربعة منجّدة بزر كريستال',
      en: 'Tufted Square Cushion with Crystal Button',
      descAr: 'مخدة مربعة من المخمل المضلّع، مقسّمة إلى أربعة أجزاء تلتقي عند زر كريستالي في المنتصف، بأطراف مشدودة تمنحها شكلاً منحوتاً.',
      descEn: 'A square cushion in ribbed velvet, stitched into four panels that meet at a central crystal button, with pinched corners for a sculpted shape.',
      colors: {
        grey: ['tufted-cushions-sofa.jpg'],
        beige: [],
        navy: [],
        royal_blue: [],
      },
      price: 49,
    },
  ],
};
