type PageTitleProps = {
  subtitle: string
  title: string
}

export function PageTitle({ subtitle, title }: PageTitleProps) {
  return (
    <div className="page-title">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  )
}
