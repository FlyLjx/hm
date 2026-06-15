package generation

import (
	"context"
	"database/sql"
	"log/slog"
	"sync"
	"time"

	"aipi-go/internal/tasks"
	"aipi-go/internal/users"
)

type Queue struct {
	jobs     chan Job
	workers  int
	service  *Service
	logger   *slog.Logger
	started  bool
	mu       sync.Mutex
	shutdown chan struct{}
}

type Job struct {
	TaskID string
}

func NewQueue(db *sql.DB, logger *slog.Logger, workers int, hub *tasks.Hub, userHub *users.Hub) *Queue {
	if workers <= 0 {
		workers = 3
	}
	return &Queue{
		jobs:     make(chan Job, workers*4),
		workers:  workers,
		service:  NewService(db, logger, hub, userHub),
		logger:   logger,
		shutdown: make(chan struct{}),
	}
}

func (q *Queue) Start() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.started {
		return
	}
	q.started = true
	for index := 0; index < q.workers; index++ {
		go q.worker(index + 1)
	}
}

func (q *Queue) Enqueue(taskID string) {
	q.Start()
	q.jobs <- Job{TaskID: taskID}
}

func (q *Queue) worker(workerID int) {
	for {
		select {
		case <-q.shutdown:
			return
		case job := <-q.jobs:
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Minute)
			err := q.service.Process(ctx, job.TaskID)
			cancel()
			if err != nil {
				q.logger.Error("generation worker failed", "worker", workerID, "taskId", job.TaskID, "error", err)
			}
		}
	}
}

type Service struct {
	db      *sql.DB
	logger  *slog.Logger
	tasks   *tasks.Repository
	hub     *tasks.Hub
	userHub *users.Hub
}

func NewService(db *sql.DB, logger *slog.Logger, hub *tasks.Hub, userHub *users.Hub) *Service {
	return &Service{
		db:      db,
		logger:  logger,
		tasks:   tasks.NewRepository(db),
		hub:     hub,
		userHub: userHub,
	}
}
