-- Set search path
SET search_path TO kgp_bus_track;

-- Insert admin data
INSERT INTO admin (name, email, password) VALUES
('Admin User', 'admin@kgp.ac.in', 'hashed_password_123'),
('System Admin', 'system@kgp.ac.in', 'hashed_password_456');

-- Insert bus stops
INSERT INTO bus_stops (name, latitude, longitude) VALUES
('Main Gate', 22.3190, 87.3091),
('Tech Market', 22.3150, 87.3110),
('Halls of Residence', 22.3170, 87.3180),
('Library', 22.3210, 87.3090),
('Academic Complex', 22.3195, 87.3085),
('Hospital', 22.3230, 87.3120),
('Lakeside', 22.3160, 87.3200);

-- Insert buses
INSERT INTO buses (name) VALUES
('KGP Express 1'),
('KGP Express 2'),
('Campus Shuttle 1'),
('Campus Shuttle 2'),
('Night Service');

-- Insert routes
INSERT INTO routes (bus_id, bus_stop_id, stop_order) VALUES
(1, 1, 1), (1, 2, 2), (1, 3, 3), (1, 4, 4), (1, 5, 5),
(2, 1, 1), (2, 4, 2), (2, 5, 3), (2, 6, 4),
(3, 2, 1), (3, 3, 2), (3, 7, 3), (3, 4, 4),
(4, 1, 1), (4, 2, 2), (4, 6, 3), (4, 7, 4),
(5, 1, 1), (5, 3, 2), (5, 7, 3);

-- Insert bus drivers
INSERT INTO bus_drivers (name, email, password, bus_id) VALUES
('Rajesh Kumar', 'rajesh@kgpbus.in', 'driver_pw_123', 1),
('Sunil Sharma', 'sunil@kgpbus.in', 'driver_pw_456', 2),
('Manoj Singh', 'manoj@kgpbus.in', 'driver_pw_789', 3),
('Ramesh Patel', 'ramesh@kgpbus.in', 'driver_pw_101', 4),
('Vikram Yadav', 'vikram@kgpbus.in', 'driver_pw_102', 5);

-- Insert students
INSERT INTO students (name, rollno, password, email) VALUES
('Ankit Sharma', '20CS10001', 'student_pw_001', 'ankit@kgp.ac.in'),
('Priya Patel', '20CS10002', 'student_pw_002', 'priya@kgp.ac.in'),
('Ravi Kumar', '20CS10003', 'student_pw_003', 'ravi@kgp.ac.in'),
('Sneha Singh', '20CS10004', 'student_pw_004', 'sneha@kgp.ac.in'),
('Aditya Gupta', '20CS10005', 'student_pw_005', 'aditya@kgp.ac.in'),
('Meera Reddy', '20CS10006', 'student_pw_006', 'meera@kgp.ac.in'),
('Rahul Verma', '20CS10007', 'student_pw_007', 'rahul@kgp.ac.in'),
('Neha Joshi', '20CS10008', 'student_pw_008', 'neha@kgp.ac.in');

-- Insert bus location data (simulating different timestamps and positions)
INSERT INTO locations (bus_id, timestamp, latitude, longitude) VALUES
(1, NOW() - INTERVAL '10 minutes', 22.3190, 87.3091),
(1, NOW() - INTERVAL '5 minutes', 22.3160, 87.3100),
(1, NOW(), 22.3170, 87.3140),
(2, NOW() - INTERVAL '15 minutes', 22.3210, 87.3090),
(2, NOW() - INTERVAL '7 minutes', 22.3200, 87.3080),
(2, NOW(), 22.3190, 87.3085),
(3, NOW() - INTERVAL '20 minutes', 22.3150, 87.3110),
(3, NOW() - INTERVAL '10 minutes', 22.3160, 87.3150),
(3, NOW(), 22.3170, 87.3180),
(4, NOW() - INTERVAL '12 minutes', 22.3190, 87.3091),
(4, NOW() - INTERVAL '6 minutes', 22.3170, 87.3100),
(4, NOW(), 22.3160, 87.3120),
(5, NOW() - INTERVAL '30 minutes', 22.3190, 87.3091),
(5, NOW() - INTERVAL '15 minutes', 22.3180, 87.3120),
(5, NOW(), 22.3160, 87.3200);