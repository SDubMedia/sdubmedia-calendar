// Centered letterhead block prepended to a rendered contract — used by
// both the public sign page (data comes from the contract-sign API)
// and the in-app View Contract dialog (data comes from AppContext +
// useAuth). Two callsites, one component, identical visuals.

interface BusinessInfo {
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  website?: string;
}

interface Props {
  orgName?: string;
  ownerName?: string;
  orgLogo?: string;
  businessInfo?: BusinessInfo | null;
  /** Optional intro line shown under the contact info. */
  intro?: string;
}

export function ContractLetterhead({ orgName, ownerName, orgLogo, businessInfo, intro }: Props) {
  if (!orgName && !orgLogo) return null;
  const bi = businessInfo || {};
  const contactBits = [ownerName, bi.phone, bi.email].filter(Boolean).join(" | ");
  const addressBits = [bi.address, bi.city, bi.state, bi.zip].filter(Boolean).join(", ");

  return (
    <div className="px-6 sm:px-10 pt-10 pb-6 text-center border-b border-gray-100">
      {orgLogo && (
        <img
          src={orgLogo}
          alt={orgName}
          className="mx-auto h-20 w-auto mb-5 object-contain"
        />
      )}
      {orgName && (
        <h2
          className="text-2xl font-bold text-gray-900 mb-3"
          style={{ fontFamily: "'Source Serif Pro', Georgia, serif" }}
        >
          {orgName}
        </h2>
      )}
      {contactBits && <p className="text-sm text-gray-600">{contactBits}</p>}
      {addressBits && <p className="text-sm text-gray-600 mt-1">{addressBits}</p>}
      {bi.website && (
        <p className="text-sm mt-1">
          <a
            href={bi.website}
            className="text-gray-700 underline"
            target="_blank"
            rel="noreferrer"
          >
            {bi.website.replace(/^https?:\/\//, "")}
          </a>
        </p>
      )}
      {intro && (
        <p className="text-base text-gray-700 mt-6 max-w-md mx-auto leading-relaxed">
          {intro}
        </p>
      )}
    </div>
  );
}
