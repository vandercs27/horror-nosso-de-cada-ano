const express = require('express');
const mongoose = require('mongoose');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

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

    // Retorna a união do painel admin com a TMDB
    res.json([...localMovies, ...tmdbMovies]);
  } catch (error) {
    console.error("Erro na rota TMDB:", error.message);
    res.status(500).json({ error: 'Erro ao buscar os filmes na TMDB.' });
  }
});

// Rota para buscar detalhes específicos de um filme pelo ID na TMDB
app.get('/api/movie/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const tmdbApiKey = process.env.TMDB_API_KEY;
    const response = await axios.get(`https://api.themoviedb.org/3/movie/${id}`, {
      params: {
        api_key: tmdbApiKey,
        language: 'pt-BR'
      }
    });

    const movie = response.data;
    res.json({
      id: movie.id,
      title: movie.title,
      originalTitle: movie.original_title,
      releaseDate: movie.release_date ? movie.release_date.split('-').reverse().join('/') : 'Data não informada',
      synopsis: movie.overview || 'Sinopse indisponível.',
      posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=Sem+Poster',
      backdropUrl: movie.backdrop_path ? `https://image.tmdb.org/t/p/original${movie.backdrop_path}` : null,
      imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : 0,
      runtime: movie.runtime ? `${movie.runtime} minutos` : 'Duração não informada'
    });
  } catch (error) {
    res.status(404).json({ error: 'Filme não encontrado.' });
  }
});

// Rota para pesquisar filmes pelo título digitado na barra de busca
app.get('/api/search', async (req, res) => {
  const { query } = req.query;
  try {
    const tmdbApiKey = process.env.TMDB_API_KEY;
    if (!tmdbApiKey || !query) {
      return res.json([]);
    }

    const response = await axios.get(`https://api.themoviedb.org/3/search/movie`, {
      params: {
        api_key: tmdbApiKey,
        query: query,
        language: 'pt-BR'
      }
    });

    // Filtra opcionalmente para garantir que traga foco de terror ou retorna os resultados encontrados
    const movies = response.data.results.map(movie => ({
      id: movie.id,
      title: movie.title,
      releaseYear: movie.release_date ? movie.release_date.split('-')[0] : 'N/A',
      synopsis: movie.overview || 'Sinopse indisponível.',
      posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=Sem+Poster',
      imdbRating: movie.vote_average ? movie.vote_average.toFixed(1) : 0,
      isUpcoming: false
    }));

    res.json(movies);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao pesquisar filmes.' });
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