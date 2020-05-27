module.exports = {
    purge: {
        enabled: process.env.NODE_ENV === 'production',
        content: [
            './public/**/*.html',
            './src/**/*.vue'
        ]
    },
    theme: {
        extend: {},
    },
    variants: {},
    corePlugins: {
        preflight: false
    },
    plugins: [
        'margin',
        'padding',
        'fontSize'
    ],
}
