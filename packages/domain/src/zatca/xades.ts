/**
 * XAdES-BES enveloped signature extension in the exact shape ZATCA's validator expects
 * (UBLDocumentSignatures → SignatureInformation → ds:Signature). Hashing and ECDSA signing are done
 * by the caller (they need a crypto library); this module only produces the XML.
 *
 * ZATCA specifics:
 *  - The first reference digests the invoice (minus UBLExtensions, cac:Signature and the QR).
 *  - SignatureValue is ECDSA-SHA256 over that invoice hash, not over SignedInfo.
 *  - The certificate and signed-properties digests are base64 of the *hex* SHA-256 string.
 */
const DS = 'http://www.w3.org/2000/09/xmldsig#';
const XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const C14N11 = 'http://www.w3.org/2006/12/xml-c14n11';
const XPATH = 'http://www.w3.org/TR/1999/REC-xpath-19991116';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface SigningCertificateInfo {
  /** Base64 DER of the CSID certificate (no PEM armour). */
  certificateBase64: string;
  /** base64(hex(sha256(certificateBase64))). */
  certificateDigest: string;
  /** RFC 4514 issuer name, e.g. "CN=TSZEINVOICE-SubCA-1, DC=extgazt, DC=gov, DC=local". */
  issuerName: string;
  /** Decimal serial number. */
  serialNumber: string;
}

/** The xades:SignedProperties element whose digest goes into the second reference. */
export function signedPropertiesXml(signingTime: string, cert: SigningCertificateInfo): string {
  return (
    `<xades:SignedProperties xmlns:xades="${XADES}" Id="xadesSignedProperties">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${esc(signingTime)}</xades:SigningTime>` +
    `<xades:SigningCertificate><xades:Cert><xades:CertDigest>` +
    `<ds:DigestMethod xmlns:ds="${DS}" Algorithm="${SHA256}"></ds:DigestMethod>` +
    `<ds:DigestValue xmlns:ds="${DS}">${esc(cert.certificateDigest)}</ds:DigestValue>` +
    `</xades:CertDigest><xades:IssuerSerial>` +
    `<ds:X509IssuerName xmlns:ds="${DS}">${esc(cert.issuerName)}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber xmlns:ds="${DS}">${esc(cert.serialNumber)}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial></xades:Cert></xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties></xades:SignedProperties>`
  );
}

export interface SignatureExtensionInput {
  invoiceHash: string;
  signatureValue: string;
  signingTime: string;
  /** Absent for an uncertified development key: KeyInfo and SignedProperties are then omitted. */
  certificate?: SigningCertificateInfo;
  /** base64(hex(sha256(signedPropertiesXml))), required with a certificate. */
  signedPropertiesDigest?: string;
}

/** Content of ext:UBLExtensions (one ext:UBLExtension). */
export function signatureExtensionXml(input: SignatureExtensionInput): string {
  const transforms = [
    'not(//ancestor-or-self::ext:UBLExtensions)',
    'not(//ancestor-or-self::cac:Signature)',
    "not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])",
  ]
    .map((x) => `<ds:Transform Algorithm="${XPATH}"><ds:XPath>${esc(x)}</ds:XPath></ds:Transform>`)
    .join('');
  const cert = input.certificate;
  const signedPropsRef =
    cert && input.signedPropertiesDigest
      ? `<ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">` +
        `<ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue>${esc(input.signedPropertiesDigest)}</ds:DigestValue></ds:Reference>`
      : '';
  const keyInfo = cert ? `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${esc(cert.certificateBase64)}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` : '';
  const object = cert
    ? `<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="signature">${signedPropertiesXml(input.signingTime, cert)}</xades:QualifyingProperties></ds:Object>`
    : '';
  return (
    `<ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent>` +
    `<sig:UBLDocumentSignatures xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2" xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2">` +
    `<sac:SignatureInformation><cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
    `<ds:Signature xmlns:ds="${DS}" Id="signature"><ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="${C14N11}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"></ds:SignatureMethod>` +
    `<ds:Reference Id="invoiceSignedData" URI=""><ds:Transforms>${transforms}<ds:Transform Algorithm="${C14N11}"></ds:Transform></ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue>${esc(input.invoiceHash)}</ds:DigestValue></ds:Reference>` +
    signedPropsRef +
    `</ds:SignedInfo><ds:SignatureValue>${esc(input.signatureValue)}</ds:SignatureValue>${keyInfo}${object}</ds:Signature>` +
    `</sac:SignatureInformation></sig:UBLDocumentSignatures></ext:ExtensionContent></ext:UBLExtension>`
  );
}
