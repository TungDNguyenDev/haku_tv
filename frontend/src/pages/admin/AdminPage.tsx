import { ConfigProvider, Layout, Menu, Result, theme } from 'antd'
import { Link } from 'react-router-dom'
import { useT } from '../../i18n'

// antd is used only in the admin area; this module is lazy-loaded so the viewer UI never ships antd.
export default function AdminPage() {
  const t = useT()
  return (
    <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: { colorPrimary: '#e50914' } }}>
      <Layout style={{ minHeight: '100vh' }}>
        <Layout.Sider breakpoint="lg" collapsedWidth={0}>
          <div style={{ color: '#e50914', fontWeight: 900, padding: 16 }}>ADMIN</div>
          <Menu
            theme="dark"
            mode="inline"
            defaultSelectedKeys={['titles']}
            items={[
              { key: 'titles', label: t.admin.titles },
              { key: 'upload', label: 'Upload & Transcode' },
              { key: 'jobs', label: 'Jobs' },
            ]}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24 }}>
          <Result
            status="info"
            title={t.admin.title}
            subTitle={t.admin.subtitle}
            extra={<Link to="/">{t.admin.back}</Link>}
          />
        </Layout.Content>
      </Layout>
    </ConfigProvider>
  )
}
