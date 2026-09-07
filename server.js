const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');

// Carrega o .env apenas se estiver rodando localmente na sua máquina
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

// Conexão segura com o MongoDB
mongoose.connect(process.env.MONGO_URI || '')
  .then(() => console.log('Conectado ao MongoDB do Horror!'))
  .catch(err => console.log('Aviso: MongoDB offline. Operando apenas com a TMDB.'));

// Schema do Banco de Dados para Cadastros Futuros
const MovieSchema = new mongoose.Schema({
  title: { type: String, required: true },
  releaseYear: { type: Number, required: true },
  synopsis: { type: String, required: true },
  curiosities: { type: String },
  posterUrl: { type: String, required: true },
  isUpcoming: { type: Boolean, default: true }
}, { timestamps: true });

const Movie = mongoose.model('Movie', MovieSchema);

// Rota de busca por ano: Junta banco local + TMDB (Gênero Horror ID: 27)
app.get('/api/movies/:year', async (req, res) => {
  const { year } = req.params;
  try {
    let localMovies = [];
    if (mongoose.connection.readyState === 1) {
      try {
        localMovies = await Movie.find({ releaseYear: year }).maxTimeMS(2000);
      } catch (dbErr) {
        console.log('Aviso: Ignorando busca local.');
      }
    }

    let tmdbMovies = [];
    const tmdbApiKey = process.env.TMDB_API_KEY;

    if (tmdbApiKey) {
      // Busca na TMDB filtrando por gênero de terror (ID 27) e pelo ano exato de lançamento
      const response = await axios.get(`https://api.themoviedb.org/3/discover/movie`, {
        params: {
          api_key: tmdbApiKey,
          with_genres: 27,
          primary_release_year: year,
          language: 'pt-BR',
          sort_by: 'vote_average.desc',
          'vote_count.gte': 10 // Filtro para garantir relevância e evitar títulos vazios
        }
      });

      if (response.data && response.data.results) {
        tmdbMovies = response.data.results.map(movie => ({
          id: movie.id,
          title: movie.title,
          releaseYear: year,
          synopsis: movie.overview ? movie.overview : 'Sinopse indisponível em português.',
          posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=Sem+Poster',
          imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : 0,
          isUpcoming: false
        }));
      }
    }

    // rota para destaque do dia
   app.get('/api/daily-highlight', async (req, res) => {
    try {
        const response = await axios.get('https://api.themoviedb.org/3/discover/movie', {
            params: {
                api_key: process.env.TMDB_API_KEY,
                with_genres: '27',
                sort_by: 'vote_average.desc',
                'vote_count.gte': 100,
                language: 'pt-BR',
                page: 1
            }
        });

        const movies = response.data.results || [];
        let highlight = movies.length > 0 ? movies[Math.floor(Math.random() * Math.min(movies.length, 10))] : null;

        if (!highlight) {
            return res.status(404).json({ error: 'Nenhum destaque encontrado' });
        }

        const releaseYear = new Date(highlight.release_date).getFullYear();
        const currentYear = new Date().getFullYear();
        const yearsAgo = currentYear - releaseYear;

        // Formata a data para DD/MM/AAAA aqui no backend para garantir
        let formattedDate = 'N/D';
        if (highlight.release_date) {
            const parts = highlight.release_date.split('-');
            if (parts.length === 3) {
                formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
        }

        res.json({
            id: highlight.id,
            title: highlight.title,
            releaseDate: formattedDate,
            yearsAgo: yearsAgo > 0 ? `${yearsAgo} anos atrás` : 'Lançamento recente',
            imdbRating: highlight.vote_average ? highlight.vote_average.toFixed(1) : 'N/A',
            synopsis: highlight.overview || 'Sinopse indisponível.',
            posterUrl: highlight.poster_path ? `https://image.tmdb.org/t/p/w500${highlight.poster_path}` : null,
            backdropUrl: highlight.backdrop_path ? `https://image.tmdb.org/t/p/w1280${highlight.backdrop_path}` : null
        });
    } catch (error) {
        console.error('Erro no destaque do dia:', error.message);
        res.status(500).json({ error: 'Erro ao carregar destaque' });
    }
});

    // Retorna a união do painel admin com a TMDB
    res.json([...localMovies, ...tmdbMovies]);
  } catch (error) {
    console.error("Erro na rota TMDB:", error.message);
    res.status(500).json({ error: 'Erro ao buscar os filmes na TMDB.' });
  }
});

// Rota para buscar detalhes específicos de um filme pelo ID na TMDB
app.get('/api/movie/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        
        const [movieRes, creditsRes] = await Promise.all([
            axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                params: { api_key: process.env.TMDB_API_KEY, language: 'pt-BR' }
            }),
            axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                params: { api_key: process.env.TMDB_API_KEY, language: 'pt-BR' }
            })
        ]);

        const movie = movieRes.data;
        const credits = creditsRes.data;

        // Processa o elenco principal
        const castList = credits.cast ? credits.cast.slice(0, 5).map(actor => actor.name).join(', ') : 'Não informado';

        // Processa o diretor com segurança
        const crew = credits.crew || [];
        const directorObj = crew.find(p => p.job === 'Director' || p.job === 'Diretor');
        const directorName = directorObj ? directorObj.name : 'Não informado';

        res.json({
            id: movie.id,
            title: movie.title,
            releaseDate: movie.release_date || 'N/D', // Data completa sem cortes
            imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
            runtime: movie.runtime ? `${movie.runtime} min` : 'N/D',
            synopsis: movie.overview || 'Sinopse indisponível em português.',
            posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
            cast: castList,
            director: directorName
        });
    } catch (error) {
        console.error('Erro nos detalhes:', error.message);
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});

// Rota para pesquisar filmes pelo título digitado na barra de busca
// Rota de busca estritamente filtrada para o gênero de terror (ID 27)
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.query;
        const response = await axios.get('https://api.themoviedb.org/3/search/movie', {
            params: {
                api_key: process.env.TMDB_API_KEY,
                query: query,
                language: 'pt-BR'
            }
        });

        // Filtra garantindo que o filme realmente contenha o gênero de terror (27) na lista de gêneros dele
        const horrorMovies = response.data.results.filter(movie => 
            movie.genre_ids && movie.genre_ids.includes(27)
        );

        // Exemplo aplicado na rota de busca ou listagem
const movies = response.data.results
    .filter(movie => movie.vote_count >= 10) // Exige pelo menos 10 votos para a nota ser considerada
    .map(movie => ({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.release_date || 'N/D',
        imdbRating: movie.vote_average && movie.vote_average > 0 ? movie.vote_average.toFixed(1) : 'Sem nota',
        posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
        synopsis: movie.overview || 'Sinopse indisponível em português.'
    }));

        res.json(movies);
    } catch (error) {
        console.error('Erro na busca:', error.message);
        res.status(500).json({ error: 'Erro ao buscar filmes' });
    }
});

// Rota de detalhes incluindo Diretor e Elenco
app.get('/api/movie/:id', async (req, res) => {
    try {
        const movieId = req.params.id;
        
        const [movieRes, creditsRes] = await Promise.all([
            axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
                params: { api_key: process.env.TMDB_API_KEY, language: 'pt-BR' }
            }),
            axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
                params: { api_key: process.env.TMDB_API_KEY, language: 'pt-BR' }
            })
        ]);

        const movie = movieRes.data;
        const credits = creditsRes.data;

        // Extração exata baseada na especificação do TMDb
        const castList = credits.cast ? credits.cast.slice(0, 5).map(a => a.name).join(', ') : 'Não informado';
        
        const directorObj = credits.crew ? credits.crew.find(person => person.job === 'Director') : null;
        const directorName = directorObj ? directorObj.name : 'Não informado';

        res.json({
            id: movie.id,
            title: movie.title,
            releaseDate: movie.release_date ? movie.release_date.split('-')[0] : 'N/D',
            imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : 'N/A',
            runtime: movie.runtime ? `${movie.runtime} min` : 'N/D',
            synopsis: movie.overview || 'Sinopse indisponível em português.',
            posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
            backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/w1280${movie.backdrop_path}` : null,
            cast: castList,
            director: directorName
        });
    } catch (error) {
        console.error('Erro nos detalhes:', error.message);
        res.status(500).json({ error: 'Erro ao buscar detalhes' });
    }
});
// Rota para buscar trailers e vídeos do filme
app.get('/api/movie/:id/videos', async (req, res) => {
    try {
        const movieId = req.params.id;
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}/videos`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                language: 'pt-BR'
            }
        });

        // Procura primeiro por um trailer oficial em português, senão pega qualquer vídeo do YouTube
        const videos = response.data.results;
        let trailer = videos.find(v => v.type === 'Trailer' && v.site === 'YouTube');
        
        if (!trailer && videos.length > 0) {
            trailer = videos.find(v => v.site === 'YouTube');
        }

        res.json(trailer ? { key: trailer.key, name: trailer.name } : null);
    } catch (error) {
        console.error('Erro ao buscar trailer:', error.message);
        res.status(500).json({ error: 'Erro ao buscar trailer' });
    }
});



// Rota Admin: Cadastrar novo filme futuro
app.post('/api/admin/movies', async (req, res) => {
  try {
    const newMovie = new Movie({ ...req.body, isUpcoming: true });
    await newMovie.save();
    res.status(201).json({ message: 'Filme cadastrado com sucesso!', newMovie });
  } catch (error) {
    res.status(400).json({ error: 'Erro ao salvar o filme.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));