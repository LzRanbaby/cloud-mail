import http from '@/axios/index.js'

export function translateText(text) {
    return http.post('/translate', { text })
}
