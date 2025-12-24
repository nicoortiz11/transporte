package com.transporte.gestion_viaje.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDate;

@Entity
@Table(name = "viajes")
@Data // Esto genera automáticamente los Getters y Setters
public class Viaje {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "productor_id")
    private Cliente productor; // El que pone la carga

    @ManyToOne
    @JoinColumn(name = "transportista_id")
    private Cliente transportista; // El que pone el camión

    private String origen;
    private String destino;
    private Double kilos;

    // Cambiamos el nombre para que coincida con el Controller
    private Double precioPorTonelada;

    // Agregamos este campo que faltaba
    private Double montoNeto;

    private Double monto; // Este es el Bruto (con IVA)
    private String fecha;
    private String estado;
    private Double porcentajeComision;
    private Double ivaPorcentaje;
    private Double gananciaNeta;

    private String cartaDePorte;
}